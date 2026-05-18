import { describe, expect, it } from "vitest";
import { createHkdfEncryptor } from "../secret-storage";

/**
 * Master key inputs in these tests are always ≥ 32 bytes so they pass the
 * AES-256 length floor without depending on base64-decoding the dev/prod
 * `BETTER_AUTH_SECRET`.
 */
const MASTER = "test-master-key-needs-at-least-32-bytes-ok";
const OTHER_MASTER = "different-master-key-also-32-plus-bytes-ok";

describe("secret-storage — round trip + invariants", () => {
  it("decrypts what it encrypted", () => {
    const enc = createHkdfEncryptor({ masterKey: MASTER });
    const plaintext = "9b3f5a07-a-fake-webhook-secret";
    const envelope = enc.encrypt(plaintext);
    expect(envelope.startsWith("iedora/v1:")).toBe(true);
    expect(enc.decrypt(envelope)).toBe(plaintext);
  });

  it("HKDF derivation is deterministic — two encryptors mutually decrypt", () => {
    const a = createHkdfEncryptor({ masterKey: MASTER });
    const b = createHkdfEncryptor({ masterKey: MASTER });
    const ctA = a.encrypt("hello");
    const ctB = b.encrypt("hello");
    // Different ciphertexts (random IVs) …
    expect(ctA).not.toBe(ctB);
    // … but the keys are identical so each one decrypts the other.
    expect(b.decrypt(ctA)).toBe("hello");
    expect(a.decrypt(ctB)).toBe("hello");
  });

  it("rejects a tampered ciphertext (GCM auth tag fails)", () => {
    const enc = createHkdfEncryptor({ masterKey: MASTER });
    const envelope = enc.encrypt("payload");
    // Flip one base64url character in the body — touches the ciphertext or
    // tag region and the GCM tag check rejects it on `decipher.final()`.
    const [prefix, body] = envelope.split(":") as [string, string];
    const flipped =
      body[10] === "A" ? body.slice(0, 10) + "B" + body.slice(11)
                       : body.slice(0, 10) + "A" + body.slice(11);
    expect(() => enc.decrypt(`${prefix}:${flipped}`)).toThrow();
  });

  it("rejects ciphertext encrypted with a different master key", () => {
    const a = createHkdfEncryptor({ masterKey: MASTER });
    const b = createHkdfEncryptor({ masterKey: OTHER_MASTER });
    const fromA = a.encrypt("secret");
    expect(() => b.decrypt(fromA)).toThrow();
  });

  it("magic-prefix detection: isEncrypted distinguishes plaintext from envelope", () => {
    const enc = createHkdfEncryptor({ masterKey: MASTER });
    expect(enc.isEncrypted("iedora/v1:abc")).toBe(true);
    expect(enc.isEncrypted("raw-secret")).toBe(false);
    // Forward-compat: a v2 envelope is still "encrypted" — the prefix
    // sniff doesn't care about version, only `decrypt` does.
    expect(enc.isEncrypted("iedora/v2:abc")).toBe(true);
  });

  it("decrypt throws on an unsupported envelope version", () => {
    const enc = createHkdfEncryptor({ masterKey: MASTER });
    expect(() => enc.decrypt("iedora/v2:abcdef")).toThrow(/unsupported/i);
  });

  it("decrypt throws on a non-envelope input", () => {
    const enc = createHkdfEncryptor({ masterKey: MASTER });
    expect(() => enc.decrypt("not-an-envelope")).toThrow(/iedora envelope/i);
  });

  it("construction throws synchronously on a too-short master key", () => {
    expect(() => createHkdfEncryptor({ masterKey: "too-short" })).toThrow(
      /too short/i,
    );
  });

  it("two encrypts of the same plaintext produce distinct ciphertexts (IV is random)", () => {
    const enc = createHkdfEncryptor({ masterKey: MASTER });
    const a = enc.encrypt("same");
    const b = enc.encrypt("same");
    expect(a).not.toBe(b);
    // …but both decrypt back to the same plaintext.
    expect(enc.decrypt(a)).toBe("same");
    expect(enc.decrypt(b)).toBe("same");
  });

  it("tamper rejection is via thrown error, never a silent return", () => {
    const enc = createHkdfEncryptor({ masterKey: MASTER });
    const envelope = enc.encrypt("auth-check");
    const [prefix, body] = envelope.split(":") as [string, string];
    const corrupted = `${prefix}:${body.slice(0, -2)}AA`;
    let threw = false;
    try {
      enc.decrypt(corrupted);
    } catch {
      threw = true;
    }
    // Critical assertion: the rejection path is a thrown error. A
    // catch-and-return-empty-string regression would slip past a
    // `decrypt(corrupted) !== plaintext` check; this is the version
    // that protects against it.
    expect(threw).toBe(true);
  });

  it("salt version v1 is the default and tags the derivation", () => {
    // Future-proofing: providing an explicit salt version should produce
    // a working encryptor (this exercises the typed code path; today only
    // v1 is registered).
    const enc = createHkdfEncryptor({ masterKey: MASTER, saltVersion: "v1" });
    const envelope = enc.encrypt("x");
    expect(enc.decrypt(envelope)).toBe("x");
  });

  it("decodes a base64-encoded master key (Better Auth's generate-secret format)", () => {
    // 32 raw bytes → 44 base64 chars (with padding). Better Auth ships
    // this format; the encryptor must accept it without complaint.
    const raw = Buffer.alloc(32, 7).toString("base64");
    const enc = createHkdfEncryptor({ masterKey: raw });
    const envelope = enc.encrypt("works");
    expect(enc.decrypt(envelope)).toBe("works");
  });
});
