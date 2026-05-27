/**
 * No-op for now. Per-spec resources are torn down via fixtures; the
 * global Postgres client used in `global-setup.ts` is closed in its
 * own `finally`. Kept as an explicit hook so adding cross-suite
 * cleanup later (artifact tar, OTel flush, …) is a one-file change.
 */
export default async function globalTeardown() {}
