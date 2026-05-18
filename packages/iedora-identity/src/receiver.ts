import {
  SIGNATURE_HEADER,
  type IdentityEvent,
  type IdentityEventName,
  type IdentityWebhookEnvelope,
} from "./events";
import {
  constantTimeHexEqual,
  parseSignatureHeader,
  signSignedPayload,
} from "./signature";
import type { DedupStore, HandlerMap } from "./types";

export type ReceiverOptions<Handlers extends Partial<HandlerMap>> = {
  /** Shared HMAC secret. Same value the sender (genkan) was registered with. */
  secret: string;
  /**
   * Partial handler map — any event without a handler is ignored (logged
   * once if `warnOnUnknown` is true). This lets each product opt into the
   * subset it cares about.
   */
  on: Handlers;
  /** Default: true. Set false in tests to silence the console. */
  warnOnUnknown?: boolean;
  /**
   * Replay tolerance window in milliseconds. The signature header's `t=`
   * field must be within `±toleranceMs` of `now()` or the request is
   * rejected with 401. Default: 300_000 (5 minutes).
   */
  toleranceMs?: number;
  /**
   * Idempotency store for at-most-once delivery semantics. The receiver
   * remembers each accepted envelope's `id` for 24h and returns 200 + a
   * no-op on a duplicate (so the sender stops retrying without seeing an
   * error). Default: an in-process Map with periodic GC — sufficient for
   * single-instance products; multi-instance deployments should pass a
   * Redis-backed implementation.
   */
  dedupStore?: DedupStore;
  /**
   * Idempotency window in milliseconds. After this much time has passed
   * since first receipt, the same `id` can be processed again. Default:
   * 86_400_000 (24 hours).
   */
  dedupTtlMs?: number;
  /** Injected clock — used for replay + dedup TTL. Tests inject a fake. */
  now?: () => number;
};

type Receiver = {
  /**
   * Next.js App Router-shaped handler. Works in any runtime that supports
   * the Web Fetch API — Next, Workers, bare node:http with a fetch shim.
   */
  POST(req: Request): Promise<Response>;
};

function isIdentityEnvelope(value: unknown): value is IdentityWebhookEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.event === "string" &&
    typeof v.occurred_at === "string" &&
    typeof v.payload === "object" &&
    v.payload !== null
  );
}

/**
 * Default in-process dedup store: `Map<id, expiresAtMs>` with lazy GC on
 * write (sweep at most once per 1000 writes, bounded by the map size).
 * Cold-start cost is effectively zero — no allocation until the first
 * write — so attaching this to a receiver in tests adds no measurable
 * boot time.
 *
 * Multi-instance deployments should provide their own store; this one is
 * not shared across processes.
 */
function createInMemoryDedupStore(): DedupStore {
  const seen = new Map<string, number>();
  let sinceSweep = 0;
  return {
    async has(id: string): Promise<boolean> {
      const exp = seen.get(id);
      if (exp === undefined) return false;
      if (exp <= Date.now()) {
        seen.delete(id);
        return false;
      }
      return true;
    },
    async remember(id: string, ttlMs: number): Promise<void> {
      seen.set(id, Date.now() + ttlMs);
      sinceSweep++;
      if (sinceSweep >= 1000) {
        sinceSweep = 0;
        const cutoff = Date.now();
        for (const [k, v] of seen) if (v <= cutoff) seen.delete(k);
      }
    },
  };
}

/**
 * One receiver per product per signing secret. The product mounts it as a
 * Next 16 App Router POST handler under e.g. `/api/identity/webhook` and
 * Genkan delivers events to that URL.
 *
 * Three layered defences run in order:
 *   1. **Signature**: HMAC-SHA256 over `${t}.${body}`, constant-time compare.
 *      Rejects with 401 on any mismatch.
 *   2. **Replay window**: `t` must be within `±toleranceMs` of `now()`.
 *      Rejects with 401 on stale or future timestamps.
 *   3. **Idempotency**: envelope `id` must not be in the dedup store.
 *      Duplicates return 200 with the handler **not** invoked, so the
 *      sender stops retrying the same event without seeing an error.
 */
export function createWebhookReceiver<Handlers extends Partial<HandlerMap>>(
  opts: ReceiverOptions<Handlers>,
): Receiver {
  const warnOnUnknown = opts.warnOnUnknown ?? true;
  const toleranceMs = opts.toleranceMs ?? 300_000;
  const dedupTtlMs = opts.dedupTtlMs ?? 24 * 60 * 60 * 1_000;
  const dedupStore = opts.dedupStore ?? createInMemoryDedupStore();
  const now = opts.now ?? (() => Date.now());

  return {
    async POST(req: Request): Promise<Response> {
      // Read raw text first — the signature is over the exact bytes.
      // JSON.parse-then-stringify would lose key order.
      const body = await req.text();
      const header = req.headers.get(SIGNATURE_HEADER);

      // Parse + signature in one go: the signature header's `t=` is part
      // of the signed bytes, so a malformed header maps to invalid sig.
      const parsedSig = parseSignatureHeader(header);
      if (!parsedSig) {
        return new Response("invalid signature", { status: 401 });
      }
      const expected = signSignedPayload(
        opts.secret,
        parsedSig.timestampMs,
        body,
      );
      const match = parsedSig.signatures.some((s) =>
        constantTimeHexEqual(s, expected),
      );
      if (!match) {
        return new Response("invalid signature", { status: 401 });
      }

      // Replay window: only enforced AFTER signature passes — otherwise a
      // brute-force attacker could probe valid timestamps cheaply.
      const skew = Math.abs(now() - parsedSig.timestampMs);
      if (skew > toleranceMs) {
        return new Response("timestamp out of tolerance", { status: 401 });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return new Response("malformed body", { status: 400 });
      }
      if (!isIdentityEnvelope(parsed)) {
        return new Response("malformed body", { status: 400 });
      }

      // Idempotent receive: a replayed envelope (same `id` inside the
      // window) returns 200 without invoking the handler, so the sender
      // doesn't keep retrying.
      if (await dedupStore.has(parsed.id)) {
        return new Response("ok", { status: 200 });
      }

      const eventName = parsed.event as IdentityEventName;
      // Single dynamic dispatch — index the handler map with the runtime
      // tag and call it with the matching payload. We widen to `unknown`
      // through a single cast because indexing a mapped type by a union
      // key narrows to the intersection of payloads (which is `never` for
      // disjoint payloads); the runtime correlation between `event` tag
      // and `payload` shape was already established by `isIdentityEnvelope`.
      const handler = (opts.on as Partial<HandlerMap>)[eventName] as
        | ((payload: unknown) => void | Promise<void>)
        | undefined;

      if (!handler) {
        if (warnOnUnknown) {
          console.warn(
            `[iedora-identity] no handler for event "${eventName}"; envelope id=${parsed.id}`,
          );
        }
        // Still remember the id so a redelivered unknown event doesn't
        // burn handler work on every retry.
        await dedupStore.remember(parsed.id, dedupTtlMs);
        return new Response("ok", { status: 200 });
      }

      try {
        await handler((parsed as IdentityEvent).payload);
      } catch (e) {
        console.error(
          `[iedora-identity] handler for "${eventName}" threw:`,
          e,
        );
        // Don't remember the id on handler failure — let the sender retry.
        return new Response("handler error", { status: 500 });
      }

      await dedupStore.remember(parsed.id, dedupTtlMs);
      return new Response("ok", { status: 200 });
    },
  };
}
