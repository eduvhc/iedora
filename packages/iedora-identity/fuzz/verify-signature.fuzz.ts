import { FuzzedDataProvider } from "@jazzer.js/core";
import { verifySignature } from "../src/signature.js";

// `verifySignature` MUST be total — the receiver maps a false return to
// 401, but an exception would crash the route handler and degrade the
// webhook surface to a partial-availability state.
export function fuzz(data: Buffer): void {
  const provider = new FuzzedDataProvider(data);
  const secret = provider.consumeString(64);
  const body = provider.consumeString(1024);
  const header = provider.consumeRemainingAsString();
  const result = verifySignature(secret, body, header);
  if (typeof result !== "boolean") throw new Error("result not boolean");
}
