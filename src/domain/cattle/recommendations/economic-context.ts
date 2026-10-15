/**
 * Cattle C8 — bound economic observations (CAT-INV-020) and the one economic
 * value form.
 *
 * Money representation (NUMERIC_SEMANTICS.md decision for C8): an amount is a
 * canonical exact decimal STRING with an explicit currency code, held and
 * combined only through the existing `money.ts` exports (`createMoneyAmount`,
 * `zeroMoney`, `addMoney`, `subtractMoney`, `compareMoney`) — exact decimal
 * arithmetic, never binary floating point, never rounded. A currency is never
 * implicit and never converted: Farm Return has no exchange-rate observation
 * contract, so amounts in different currencies are never combined or
 * compared (VALUE_UNKNOWN), and only the currencies `money.ts` supports
 * (`EUR`) can be computed. Money equality is amount + currency + the bound
 * observations it came from.
 *
 * An economic observation is a bound record: value key, amount, currency,
 * valid time `observedAt`, knowledge time `receivedAt`, source version +
 * content fingerprint, and append-only `supersedes`. Admission: provably later
 * `receivedAt` ⇒ invisible (never validated); unreadable ⇒ fail closed; id
 * identity before validity (equivalent instant spellings idempotent, any other
 * difference fails closed); every admitted record validated; supersession at
 * the cutoff through C2 `resolveBitemporalRecords` (links only within one
 * value key; unknown target / cycle ⇒ fail closed).
 *
 * Resolution of a value key at (`effectiveAt`, `knowledgeCutoff`), REQUIRED:
 * the live observations of the key observed by `effectiveAt`. None ⇒ UNKNOWN
 * (never zero); more than one, or one in a competing correction ⇒ CONFLICT
 * (no latest-wins, no averaging — CAT-INV-026); exactly one ⇒ KNOWN.
 */

import { compareInstants } from "../animal-ledger";
import { compareStrings } from "../integrity";
import { addMoney, compareMoney, createMoneyAmount, subtractMoney, zeroMoney, type CurrencyCode, type MoneyAmount } from "../../money";
import { canonicalObligationInstant, resolveBitemporalRecords } from "../regulatory";
import type { SourceVersionRef } from "../source";
import { dedupeIssues } from "./candidate-actions";
import type { EconomicValueForm } from "./recommendation-models";
import { SOURCE_REF, arrayOf, code, instant, isPlainObject, object, ownedContentKey, ownedValid, preferredSpelling, ref, vocabulary, withCanonicalInstants } from "./recommendation-consumed";

/** The currencies the existing `money.ts` contract computes (compile-checked to equal `CurrencyCode`). */
export const COMPUTABLE_CURRENCIES = vocabulary<CurrencyCode>()(["EUR"]);

export interface EconomicObservation {
  observationId: string;
  valueKey: string;
  /** Canonical exact decimal string (non-negative magnitude). */
  amount: string;
  /** Explicit currency code as supplied (never defaulted). */
  currency: string;
  /** VALID time (canonical spelling once admitted). */
  observedAt: string;
  /** KNOWLEDGE time (canonical spelling once admitted). */
  receivedAt: string;
  source: SourceVersionRef;
  supersedes: string[];
}

const OBSERVATION_SPEC = object({
  observationId: ref,
  valueKey: ref,
  amount: code,
  currency: ref,
  observedAt: instant,
  receivedAt: instant,
  source: SOURCE_REF,
  supersedes: arrayOf(ref),
});

function amountValid(amount: string): boolean {
  try {
    createMoneyAmount(amount, "EUR");
  } catch {
    return false;
  }
  return !amount.startsWith("-");
}

export type EconomicIssueCode =
  | "CATTLE_RECOMMENDATION_ECONOMICS_INVALID"
  | "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_INVALID"
  | "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_UNREADABLE_KNOWLEDGE_TIME"
  | "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_DUPLICATE_DIFFERENT_CONTENT"
  | "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_SUPERSESSION_INVALID";

type Issue = { code: EconomicIssueCode; ref: string | null };

const INSTANT_FIELDS = ["observedAt", "receivedAt"];

/** Admits, de-duplicates and validates the economic observations known by `knowledgeCutoff`; any defect fails closed. */
export function admitEconomicObservations(raw: unknown, knowledgeCutoff: string): { ok: true; observations: EconomicObservation[] } | { ok: false; issues: Issue[] } {
  if (!isPlainObject(raw) || Object.keys(raw).length !== 1 || !Array.isArray(raw.observations)) {
    return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_ECONOMICS_INVALID", ref: null }] };
  }
  const issues: Issue[] = [];
  const admitted: unknown[] = [];
  for (const o of raw.observations as unknown[]) {
    const receivedAt = isPlainObject(o) ? canonicalObligationInstant(o.receivedAt) : null;
    const id = isPlainObject(o) && typeof o.observationId === "string" ? o.observationId : null;
    if (receivedAt === null) issues.push({ code: "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_UNREADABLE_KNOWLEDGE_TIME", ref: id });
    else if (compareInstants(receivedAt, knowledgeCutoff) <= 0) admitted.push(o);
  }
  const byId = new Map<string, string>();
  for (const o of admitted) {
    if (!isPlainObject(o) || typeof o.observationId !== "string") continue;
    const key = ownedContentKey(o, INSTANT_FIELDS);
    const seen = byId.get(o.observationId);
    if (seen !== undefined && seen !== key) issues.push({ code: "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_DUPLICATE_DIFFERENT_CONTENT", ref: o.observationId });
    else byId.set(o.observationId, key);
  }
  const valid = new Map<string, EconomicObservation>();
  for (const o of admitted) {
    if (!ownedValid(OBSERVATION_SPEC, o) || !amountValid((o as EconomicObservation).amount) || (o as EconomicObservation).supersedes.includes((o as EconomicObservation).observationId)) {
      issues.push({ code: "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_INVALID", ref: isPlainObject(o) && typeof o.observationId === "string" ? o.observationId : null });
      continue;
    }
    const obs = withCanonicalInstants(o as EconomicObservation, INSTANT_FIELDS);
    const kept = valid.get(obs.observationId);
    valid.set(obs.observationId, kept === undefined ? obs : preferredSpelling(kept, obs));
  }
  if (issues.length > 0) return { ok: false, issues: dedupeIssues(issues) };
  const observations = [...valid.values()].map((o) => ({ ...o, supersedes: [...new Set(o.supersedes)].sort(compareStrings) })).sort((a, b) => compareStrings(a.observationId, b.observationId));
  const resolution = resolveBitemporalRecords(
    observations.map((o) => ({ recordId: o.observationId, supersedes: o.supersedes, receivedAt: o.receivedAt, o })),
    knowledgeCutoff,
    { linkAllowed: (s, t) => s.o.valueKey === t.o.valueKey, competitionKey: (r) => JSON.stringify([r.o.valueKey, r.o.amount, r.o.currency, r.o.observedAt]) },
  );
  if (resolution.linkIssues.length > 0) {
    return { ok: false, issues: dedupeIssues(resolution.linkIssues.map((l) => ({ code: "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_SUPERSESSION_INVALID" as const, ref: l.recordId }))) };
  }
  return { ok: true, observations };
}

export type EconomicValueState = "KNOWN" | "UNKNOWN" | "CONFLICT";

export interface EconomicValueResolution {
  valueKey: string;
  state: EconomicValueState;
  /** The single bound observation when KNOWN. */
  observation: EconomicObservation | null;
  /** Live in-view observations competing (CONFLICT; sorted). */
  candidateObservationIds: string[];
}

/** Resolves each value key at (`effectiveAt`, `knowledgeCutoff`) over admitted observations. */
export function resolveEconomicValues(observations: readonly EconomicObservation[], valueKeys: readonly string[], effectiveAt: string, knowledgeCutoff: string): EconomicValueResolution[] {
  const resolution = resolveBitemporalRecords(
    observations.map((o) => ({ recordId: o.observationId, supersedes: o.supersedes, receivedAt: o.receivedAt, o })),
    knowledgeCutoff,
    { linkAllowed: (s, t) => s.o.valueKey === t.o.valueKey, competitionKey: (r) => JSON.stringify([r.o.valueKey, r.o.amount, r.o.currency, r.o.observedAt]) },
  );
  const competing = new Set(resolution.competitions.flatMap((c) => c.terminals.map((t) => t.recordId)));
  return [...new Set(valueKeys)].sort(compareStrings).map((valueKey) => {
    const inView = resolution.live.filter((r) => r.o.valueKey === valueKey && compareInstants(r.o.observedAt, effectiveAt) <= 0);
    if (inView.length === 0) return { valueKey, state: "UNKNOWN", observation: null, candidateObservationIds: [] };
    if (inView.length > 1 || competing.has(inView[0].recordId)) {
      return { valueKey, state: "CONFLICT", observation: null, candidateObservationIds: inView.map((r) => r.recordId).sort(compareStrings) };
    }
    return { valueKey, state: "KNOWN", observation: inView[0].o, candidateObservationIds: [] };
  });
}

export type EconomicValue =
  | { state: "VALUE_KNOWN"; amount: string; currency: string; benefit: EconomicObservation[]; cost: EconomicObservation[] }
  | { state: "VALUE_UNKNOWN"; reasonCodes: string[] };

/**
 * `NET_OF_BOUND_OBSERVATIONS`: Σ benefit − Σ cost through `money.ts`.
 * REQUIRED: every named key KNOWN, one currency, a computable currency.
 */
export function computeNetValue(form: EconomicValueForm, resolutions: readonly EconomicValueResolution[]): EconomicValue {
  const byKey = new Map(resolutions.map((r) => [r.valueKey, r]));
  const reasons: string[] = [];
  const known = (keys: string[]) =>
    keys.map((k) => {
      const r = byKey.get(k);
      if (r === undefined || r.state !== "KNOWN" || r.observation === null) {
        reasons.push(`CATTLE_RECOMMENDATION_VALUE_INPUT_${r?.state ?? "UNKNOWN"}:${k}`);
        return null;
      }
      return r.observation;
    });
  const benefit = known(form.benefitKeys);
  const cost = known(form.costKeys);
  if (reasons.length > 0) return { state: "VALUE_UNKNOWN", reasonCodes: reasons.sort(compareStrings) };
  const all = [...benefit, ...cost] as EconomicObservation[];
  const currencies = [...new Set(all.map((o) => o.currency))];
  if (currencies.length !== 1) return { state: "VALUE_UNKNOWN", reasonCodes: [`CATTLE_RECOMMENDATION_VALUE_CURRENCY_MIXED:${currencies.sort(compareStrings).join(",")}`] };
  const currency = currencies[0];
  if (!(COMPUTABLE_CURRENCIES as readonly string[]).includes(currency)) return { state: "VALUE_UNKNOWN", reasonCodes: [`CATTLE_RECOMMENDATION_VALUE_CURRENCY_NOT_COMPUTABLE:${currency}`] };
  const money = (o: EconomicObservation): MoneyAmount => createMoneyAmount(o.amount, currency as CurrencyCode);
  let total = zeroMoney(currency as CurrencyCode);
  for (const o of benefit as EconomicObservation[]) total = addMoney(total, money(o));
  for (const o of cost as EconomicObservation[]) total = subtractMoney(total, money(o));
  return { state: "VALUE_KNOWN", amount: total.amount, currency, benefit: benefit as EconomicObservation[], cost: cost as EconomicObservation[] };
}

/** Exact comparison of two KNOWN values in one computable currency (`money.ts`); `null` when not comparable. */
export function compareKnownValues(a: { amount: string; currency: string }, b: { amount: string; currency: string }): -1 | 0 | 1 | null {
  if (a.currency !== b.currency || !(COMPUTABLE_CURRENCIES as readonly string[]).includes(a.currency)) return null;
  return compareMoney(createMoneyAmount(a.amount, a.currency as CurrencyCode), createMoneyAmount(b.amount, b.currency as CurrencyCode));
}
