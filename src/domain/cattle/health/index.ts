/**
 * Cattle C3 — health and medicines engine. Pure, deterministic engine and
 * contracts only; no product catalogue ships with it (no real product,
 * authorisation, withdrawal period, dose or vaccine). See
 * `docs/farm-return-next/DOMAIN_CONTRACTS.md` ("Cattle C3").
 */

export * from "./authorised-product";
export * from "./health-engine";
export * from "./health-hard-gates";
export * from "./health-integrity";
export * from "./health-records";
export * from "./withdrawal";
