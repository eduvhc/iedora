import { FuzzedDataProvider } from "@jazzer.js/core";
import { isBlockedIp } from "../src/ssrf.js";

// `isBlockedIp` is the synchronous CIDR check the SSRF guard calls
// against literal hostnames before the DNS lookup. It MUST be total —
// any throw would short-circuit the validate step and could let a
// malformed literal through.
export function fuzz(data: Buffer): void {
  const provider = new FuzzedDataProvider(data);
  const family: 4 | 6 = provider.consumeBoolean() ? 4 : 6;
  const addr = provider.consumeRemainingAsString();
  const result = isBlockedIp(addr, family);
  if (typeof result !== "boolean") throw new Error("result not boolean");
}
