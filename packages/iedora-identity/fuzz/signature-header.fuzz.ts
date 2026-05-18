import { FuzzedDataProvider } from "@jazzer.js/core";
import { parseSignatureHeader } from "../src/signature.js";

// `parseSignatureHeader` is contractually total: any string in, either a
// parsed shape OR `null` — never an exception. A throw here means the
// webhook receiver could be DoSed by a malformed header.
export function fuzz(data: Buffer): void {
  const provider = new FuzzedDataProvider(data);
  const header = provider.consumeRemainingAsString();
  const out = parseSignatureHeader(header);
  if (out !== null) {
    if (typeof out.timestampMs !== "number") throw new Error("timestamp not number");
    if (!Number.isFinite(out.timestampMs)) throw new Error("timestamp not finite");
    if (out.timestampMs < 0) throw new Error("timestamp negative");
    if (!Array.isArray(out.signatures)) throw new Error("signatures not array");
    for (const s of out.signatures) {
      if (typeof s !== "string") throw new Error("signature not string");
      if (!/^[0-9a-f]+$/.test(s)) throw new Error("signature not lower hex");
    }
  }
}
