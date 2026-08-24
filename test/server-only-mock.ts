/**
 * Test-only stand-in for the `server-only` package (vitest.config.mts
 * aliases it here). `server-only`'s real package resolves to a
 * throwing module unless the bundler sets React's `"react-server"`
 * export condition, which Vitest doesn't — so every `src/server/**`
 * module that imports it (correctly, to guard against accidental
 * client-bundle inclusion in the real Next.js build) would otherwise
 * fail to import in tests too. Vitest never bundles for the browser, so
 * the guard has nothing to protect here; this file intentionally does
 * nothing.
 */
export {};
