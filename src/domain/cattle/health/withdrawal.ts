/**
 * Cattle C3 — withdrawal-window calculation architecture.
 *
 * Per administration and food product, the withdrawal END is computed
 * deterministically from: the administration instant, the bound product
 * record's withdrawal period for BOVINE + that food product + the route as
 * supplied, and any explicitly supplied prescriber-specified period. Nothing
 * is assumed: every gap yields UNKNOWN (or EVIDENCE_CONFLICT) with reasons —
 * never zero, never "no withdrawal". A supplied period of zero is data and is
 * used as supplied.
 *
 * Steps (first failing step decides; reasons are recorded):
 * 1. Binding: BOUND required. EVIDENCE_CONFLICT binding ⇒ EVIDENCE_CONFLICT;
 *    any other non-bound state ⇒ UNKNOWN.
 * 2. Administration instant: `null` ⇒ UNKNOWN.
 * 3. Period entry: exactly one entry of the BOVINE authorisation for the food
 *    product whose route equals the administration's route or is `null`
 *    (supplied as not route-specific). An administration with no recorded
 *    route matches only a non-route-specific entry, and only when no
 *    route-specific entry exists for the food product. None or several ⇒
 *    UNKNOWN.
 * 4. Period: `null` (not stated) ⇒ UNKNOWN. Computation is exact UTC
 *    arithmetic (C2 `addObligationOffset`) and is supported only for whole,
 *    non-negative `DAY` (86 400 s) or `HOUR` (3 600 s) amounts; any other
 *    unit or a fractional amount ⇒ UNKNOWN (no conversion, no rounding).
 * 5. Multi-dose course: when the administration belongs to a TREATMENT with
 *    more than one live administration, the entry must state a supplied
 *    `multiDoseBasis`; otherwise UNKNOWN. With
 *    `PERIOD_FROM_EACH_ADMINISTRATION` each administration's end is computed
 *    from its own instant.
 * 6. Prescriber period for the food product, when supplied, must itself be
 *    computable (else UNKNOWN); the later end governs, so a prescriber-
 *    specified LONGER period is honoured and a shorter one never shortens the
 *    product period.
 *
 * Boundary convention (engine convention, documented and tested): the
 * withdrawal end is EXCLUSIVE — at an instant strictly before the end the
 * food product is in withdrawal; at the end instant itself it is not.
 *
 * Gate fold per food product at `effectiveAt` over the live administrations
 * that occurred by `effectiveAt` or whose time is unknown (precedence):
 * EVIDENCE_CONFLICT (competing administration corrections, or any
 * administration's computation in conflict) > UNKNOWN (any administration
 * unknown) > IN_WITHDRAWAL (the latest end, when every end is known, is after
 * `effectiveAt`) > CLEAR. CLEAR asserts only that no administration in the
 * supplied medicine record known by the cutoff holds the food product in
 * withdrawal at `effectiveAt`.
 */

import { BOVINE_SPECIES, compareInstants } from "../animal-ledger";
import { compareStrings, sortedUnique } from "../integrity";
import { addObligationOffset, isValidObligationOffset, type ObligationOffset } from "../regulatory/obligation-time";
import { compareProductVersionRefs, type AuthorisedProductRecord, type ProductBinding, type ProductVersionRef, type WithdrawalPeriodEntry } from "./authorised-product";
import type { MedicineAdministrationRecord, SuppliedQuantity } from "./health-records";

export type AdministrationWithdrawalState = "KNOWN" | "UNKNOWN" | "EVIDENCE_CONFLICT";

export interface AdministrationWithdrawal {
  foodProduct: string;
  state: AdministrationWithdrawalState;
  /** Exclusive end instant (canonical spelling); set only when KNOWN. */
  withdrawalEnd: string | null;
  /** The product-record entry used, exactly as supplied. */
  productEntry: WithdrawalPeriodEntry | null;
  /** The prescriber-specified period for this food product, exactly as supplied. */
  prescriberPeriod: SuppliedQuantity | null;
  /** Which period produced the end; set only when KNOWN. */
  governingPeriod: "PRODUCT" | "PRESCRIBER" | null;
  reasonCodes: string[];
}

/** A supplied period as an exact UTC offset, or the reason it cannot be one. */
function exactOffset(period: SuppliedQuantity): { offset: ObligationOffset } | { reason: string } {
  if (period.unit !== "DAY" && period.unit !== "HOUR") return { reason: `CATTLE_HEALTH_WITHDRAWAL_PERIOD_UNIT_UNSUPPORTED:${period.unit}` };
  const offset = { amount: period.amount, unit: period.unit };
  return isValidObligationOffset(offset) ? { offset } : { reason: "CATTLE_HEALTH_WITHDRAWAL_PERIOD_NOT_WHOLE_UNITS" };
}

/** Entries applicable to the route; `ROUTE_UNKNOWN` when the route is not recorded but the periods are route-specific. */
function matchingEntries(record: AuthorisedProductRecord, foodProduct: string, route: string | null): WithdrawalPeriodEntry[] | "ROUTE_UNKNOWN" {
  const entries = record.speciesAuthorisations.find((s) => s.species === BOVINE_SPECIES)?.withdrawalPeriods.filter((e) => e.foodProduct === foodProduct) ?? [];
  if (route === null) return entries.some((e) => e.route !== null) ? "ROUTE_UNKNOWN" : entries;
  return entries.filter((e) => e.route === null || e.route === route);
}

/**
 * Withdrawal end of one administration for one food product. `courseSize` is
 * the number of live administrations in its TREATMENT course (1 when not part
 * of a course).
 */
export function computeAdministrationWithdrawal(
  administration: MedicineAdministrationRecord,
  binding: ProductBinding,
  record: AuthorisedProductRecord | null,
  foodProduct: string,
  courseSize: number,
): AdministrationWithdrawal {
  const prescriberPeriod = administration.prescriberWithdrawal?.periods.find((p) => p.foodProduct === foodProduct)?.period ?? null;
  const result = (
    state: AdministrationWithdrawalState,
    reasons: string[],
    productEntry: WithdrawalPeriodEntry | null = null,
    withdrawalEnd: string | null = null,
    governingPeriod: AdministrationWithdrawal["governingPeriod"] = null,
  ): AdministrationWithdrawal => ({ foodProduct, state, withdrawalEnd, productEntry, prescriberPeriod, governingPeriod, reasonCodes: sortedUnique(reasons) });

  if (binding.state !== "BOUND" || record === null) {
    const reasons = [`CATTLE_HEALTH_PRODUCT_BINDING_${binding.state}`, ...binding.reasonCodes];
    return result(binding.state === "EVIDENCE_CONFLICT" ? "EVIDENCE_CONFLICT" : "UNKNOWN", reasons);
  }
  if (administration.occurredAt === null) return result("UNKNOWN", ["CATTLE_HEALTH_ADMINISTRATION_TIME_UNKNOWN"]);
  const entries = matchingEntries(record, foodProduct, administration.route);
  if (entries === "ROUTE_UNKNOWN") return result("UNKNOWN", ["CATTLE_HEALTH_WITHDRAWAL_ROUTE_UNKNOWN"]);
  if (entries.length === 0) return result("UNKNOWN", ["CATTLE_HEALTH_WITHDRAWAL_NO_PERIOD_FOR_FOOD_PRODUCT"]);
  if (entries.length > 1) return result("UNKNOWN", ["CATTLE_HEALTH_WITHDRAWAL_PERIOD_AMBIGUOUS"]);
  const entry = entries[0];
  if (entry.period === null) return result("UNKNOWN", ["CATTLE_HEALTH_WITHDRAWAL_PERIOD_NOT_STATED"], entry);
  const productOffset = exactOffset(entry.period);
  if ("reason" in productOffset) return result("UNKNOWN", [productOffset.reason], entry);
  if (courseSize > 1 && entry.multiDoseBasis === null) return result("UNKNOWN", ["CATTLE_HEALTH_WITHDRAWAL_MULTI_DOSE_RULE_NOT_SUPPLIED"], entry);
  const productEnd = addObligationOffset(administration.occurredAt, productOffset.offset);
  if (productEnd === null) return result("UNKNOWN", ["CATTLE_HEALTH_WITHDRAWAL_END_OUT_OF_RANGE"], entry);
  if (prescriberPeriod === null) return result("KNOWN", [], entry, productEnd, "PRODUCT");
  const prescriberOffset = exactOffset(prescriberPeriod);
  if ("reason" in prescriberOffset) return result("UNKNOWN", [`CATTLE_HEALTH_PRESCRIBER_${prescriberOffset.reason.replace("CATTLE_HEALTH_", "")}`], entry);
  const prescriberEnd = addObligationOffset(administration.occurredAt, prescriberOffset.offset);
  if (prescriberEnd === null) return result("UNKNOWN", ["CATTLE_HEALTH_WITHDRAWAL_END_OUT_OF_RANGE"], entry);
  return compareInstants(prescriberEnd, productEnd) > 0
    ? result("KNOWN", [], entry, prescriberEnd, "PRESCRIBER")
    : result("KNOWN", ["CATTLE_HEALTH_PRESCRIBER_PERIOD_NOT_LONGER"], entry, productEnd, "PRODUCT");
}

export type WithdrawalGateState = "CLEAR" | "IN_WITHDRAWAL" | "UNKNOWN" | "EVIDENCE_CONFLICT";

export interface WithdrawalGateEntry {
  foodProduct: string;
  state: WithdrawalGateState;
  /** Exclusive end of the withdrawal in force; set only when IN_WITHDRAWAL. */
  inWithdrawalUntil: string | null;
  /** Live administrations considered (occurred by `effectiveAt` or time unknown), sorted. */
  administrationIds: string[];
  /** Product versions bound by those administrations, sorted. */
  productVersions: ProductVersionRef[];
  reasonCodes: string[];
}

export interface GateAdministration {
  recordId: string;
  binding: ProductBinding;
  withdrawal: AdministrationWithdrawal;
}

/** Folds one food product's administrations into the gate state (precedence in the header). */
export function foldWithdrawalGate(
  foodProduct: string,
  effectiveAt: string,
  administrations: readonly GateAdministration[],
  conflictingAdministrationIds: readonly string[],
): WithdrawalGateEntry {
  const sorted = [...administrations].sort((a, b) => compareStrings(a.recordId, b.recordId));
  const versions = sorted
    .flatMap((a) => (a.binding.product ? [a.binding.product] : []))
    .sort(compareProductVersionRefs)
    .filter((v, i, arr) => i === 0 || compareProductVersionRefs(arr[i - 1], v) !== 0);
  const base = { foodProduct, administrationIds: sorted.map((a) => a.recordId), productVersions: versions };
  const reasons = sorted.flatMap((a) => a.withdrawal.reasonCodes.map((r) => `${r}|${a.recordId}`));
  if (conflictingAdministrationIds.length > 0 || sorted.some((a) => a.withdrawal.state === "EVIDENCE_CONFLICT")) {
    const conflicts = conflictingAdministrationIds.map((id) => `CATTLE_HEALTH_ADMINISTRATION_COMPETING_CORRECTIONS|${id}`);
    return { ...base, state: "EVIDENCE_CONFLICT", inWithdrawalUntil: null, reasonCodes: sortedUnique([...reasons, ...conflicts]) };
  }
  if (sorted.some((a) => a.withdrawal.state === "UNKNOWN")) return { ...base, state: "UNKNOWN", inWithdrawalUntil: null, reasonCodes: sortedUnique(reasons) };
  const ends = sorted.map((a) => a.withdrawal.withdrawalEnd as string).sort(compareInstants);
  const latest = ends.length > 0 ? ends[ends.length - 1] : null;
  if (latest !== null && compareInstants(effectiveAt, latest) < 0) return { ...base, state: "IN_WITHDRAWAL", inWithdrawalUntil: latest, reasonCodes: sortedUnique(reasons) };
  const clearReason = sorted.length === 0 ? "CATTLE_HEALTH_WITHDRAWAL_NO_RECORDED_ADMINISTRATION" : "CATTLE_HEALTH_WITHDRAWAL_ALL_ENDED";
  return { ...base, state: "CLEAR", inWithdrawalUntil: null, reasonCodes: sortedUnique([...reasons, clearReason]) };
}
