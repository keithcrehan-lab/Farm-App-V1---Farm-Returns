/**
 * Cattle C3 — health and medicines engine. Pure, deterministic engine and
 * contracts only; no product catalogue ships with it (no real product,
 * authorisation, withdrawal period, dose or vaccine). See
 * `docs/farm-return-next/DOMAIN_CONTRACTS.md` ("Cattle C3").
 */

// Resolution, binding and withdrawal evaluation (`resolveProductRecords`,
// `bindAdministrationProduct`, `computeAdministrationWithdrawal`,
// `foldWithdrawalGate`) trust already-validated, detached records and are
// module-internal: the only public evaluation path is `projectAnimalHealth`,
// which validates the complete input first (CAT-INV-001/002).
export {
  MULTI_DOSE_BASES,
  PRODUCT_RECORD_LIFECYCLES,
  admitProductRecords,
  compareProductVersionRefs,
  materialiseProductRecord,
  productKnownAt,
  productRecordContentKey,
  productVersionRef,
  type AuthorisedProductRecord,
  type MultiDoseBasis,
  type ProductAdmissionResult,
  type ProductBinding,
  type ProductBindingState,
  type ProductRecordIssue,
  type ProductRecordIssueCode,
  type ProductRecordLifecycle,
  type ProductRecordMaterialisation,
  type ProductResolution,
  type ProductSourceBinding,
  type ProductVersionRef,
  type SpeciesAuthorisation,
  type WithdrawalPeriodEntry,
} from "./authorised-product";
export * from "./health-engine";
export * from "./health-hard-gates";
export * from "./health-integrity";
export * from "./health-records";
export type {
  AdministrationWithdrawal,
  AdministrationWithdrawalState,
  GateAdministration,
  WithdrawalGateEntry,
  WithdrawalGateState,
} from "./withdrawal";
