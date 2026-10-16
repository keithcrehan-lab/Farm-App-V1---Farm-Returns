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
 * PRECISION (CAT-INV-019; F006). The canonical money layer (`money.ts`)
 * computes through `decimal.js` at that library's configured significant-digit
 * precision (documented in `money.ts` `multiplyMoney`; default 20); beyond it
 * `addMoney` / `subtractMoney` would round. C8 therefore never feeds that
 * arithmetic an amount — or a sum — that could exceed it: the limit is READ
 * from the same configuration (`MONEY_ARITHMETIC_PRECISION`), never a C8
 * constant, and never raised locally. An observation whose amount needs more
 * digits fails the request closed
 * (`..._ECONOMIC_OBSERVATION_PRECISION_UNSUPPORTED`); a net value whose exact
 * result could need more digits than the arithmetic carries is VALUE_UNKNOWN
 * (`..._VALUE_PRECISION_UNSUPPORTED`). Nothing is ever silently rounded, so
 * ranking and identity tie-breaking only ever see exact values.
 *
 * PROVENANCE (human architecture decision 2026-10-16). Every economic fact
 * C8 derives is a pure function of one canonical, fingerprinted evidence
 * object: per relevant key, `EconomicKeyEvidence` — the resolver's complete
 * consulted closure (every admitted observation of the key known by the
 * cutoff, in full, sorted) and the resolution derived from it alone — and,
 * per candidate, `EconomicValuation` derived from that evidence only.
 * Everything downstream projects from these objects; nothing re-collects
 * economic evidence.
 */

import Decimal from "decimal.js";
import { compareInstants } from "../animal-ledger";
import { compareStrings } from "../integrity";
import { addMoney, compareMoney, createMoneyAmount, subtractMoney, zeroMoney, type CurrencyCode, type MoneyAmount } from "../../money";
import { canonicalObligationInstant, resolveBitemporalRecords } from "../regulatory";
import type { SourceVersionRef } from "../source";
import { dedupeIssues } from "./candidate-actions";
import type { EconomicValueForm } from "./recommendation-models";
import type { RecommendationModelRef } from "./candidate-actions";
import type { CandidateValue } from "./recommendation-contracts";
import type { CattleInputItem } from "../information";
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

export const OBSERVATION_SPEC = object({
  observationId: ref,
  valueKey: ref,
  amount: code,
  currency: ref,
  observedAt: instant,
  receivedAt: instant,
  source: SOURCE_REF,
  supersedes: arrayOf(ref),
});

/** The canonical money layer's exact-arithmetic precision (significant digits), read from the `decimal.js` configuration `money.ts` uses. */
export const MONEY_ARITHMETIC_PRECISION: number = Decimal.precision;

/** Positional digit width of a canonical non-negative decimal string (integer digits, "0" counting none, plus every fraction digit) — an upper bound on its significant digits. */
export function amountDigitWidth(amount: string): { integer: number; fraction: number } {
  const [int, frac = ""] = amount.replace(/^-/, "").split(".");
  return { integer: int === "0" ? 0 : int.length, fraction: frac.length };
}

/** True when the amount is exactly representable by the canonical money arithmetic. */
export function amountWithinMoneyPrecision(amount: string): boolean {
  const w = amountDigitWidth(amount);
  return w.integer + w.fraction <= MONEY_ARITHMETIC_PRECISION;
}

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
  | "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_SUPERSESSION_INVALID"
  | "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_PRECISION_UNSUPPORTED";

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
    // F006: an amount the canonical money arithmetic cannot hold exactly is rejected, never rounded.
    if (!amountWithinMoneyPrecision((o as EconomicObservation).amount)) {
      issues.push({ code: "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_PRECISION_UNSUPPORTED", ref: (o as EconomicObservation).observationId });
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

/** A correction competition on one key: the corrected record and its disagreeing live terminals (sorted). */
export interface EconomicCompetition {
  targetId: string;
  terminalIds: string[];
}

/** The resolver's result for one key — a pure function of that key's closure (`resolveKeyEvidence`). */
export interface EconomicKeyResolution {
  state: EconomicValueState;
  /** KNOWN: the bound observation's id. */
  boundObservationId: string | null;
  /** CONFLICT: the live in-view observations (sorted). Empty otherwise. */
  candidateObservationIds: string[];
  /** Every correction competition on the key (sorted by target). */
  competitions: EconomicCompetition[];
}

/**
 * THE canonical economic evidence of one relevant value key (human architecture decision 2026-10-16): the
 * resolver's COMPLETE consulted closure — every admitted observation of the key known by the cutoff, in full,
 * sorted by id (superseded, out-of-view and competing records included) — and the resolution derived from that
 * closure alone. The context binds this object; every economic fact downstream is a projection of it.
 */
export interface EconomicKeyEvidence {
  valueKey: string;
  observations: EconomicObservation[];
  resolution: EconomicKeyResolution;
}

const byObservationId = (a: EconomicObservation, b: EconomicObservation) => compareStrings(a.observationId, b.observationId);

/**
 * Resolves ONE key from its closure alone at (`effectiveAt`, `knowledgeCutoff`) — the single resolver, used to build
 * the evidence and by integrity to re-check a stored one. `null` when the closure is not a valid closure of the key
 * (another key, a record not known by the cutoff, an invalid supersession link).
 * REQUIRED: the live observations of the key observed by `effectiveAt`. None ⇒ UNKNOWN (never zero); more than
 * one, or one in a competing correction ⇒ CONFLICT (no latest-wins, no averaging — CAT-INV-026); one ⇒ KNOWN.
 */
export function resolveKeyEvidence(valueKey: string, closure: readonly EconomicObservation[], effectiveAt: string, knowledgeCutoff: string): EconomicKeyResolution | null {
  if (closure.some((o) => o.valueKey !== valueKey)) return null;
  const r = resolveBitemporalRecords(
    closure.map((o) => ({ recordId: o.observationId, supersedes: o.supersedes, receivedAt: o.receivedAt, o })),
    knowledgeCutoff,
    { linkAllowed: (s, t) => s.o.valueKey === t.o.valueKey, competitionKey: (x) => JSON.stringify([x.o.valueKey, x.o.amount, x.o.currency, x.o.observedAt]) },
  );
  if (r.linkIssues.length > 0 || r.known.length !== closure.length) return null;
  const competitions = r.competitions.map((c) => ({ targetId: c.targetId, terminalIds: c.terminals.map((x) => x.recordId) }));
  const competing = new Set(competitions.flatMap((c) => c.terminalIds));
  const inView = r.live.filter((x) => compareInstants(x.o.observedAt, effectiveAt) <= 0);
  if (inView.length === 0) return { state: "UNKNOWN", boundObservationId: null, candidateObservationIds: [], competitions };
  if (inView.length > 1 || competing.has(inView[0].recordId)) {
    return { state: "CONFLICT", boundObservationId: null, candidateObservationIds: inView.map((x) => x.recordId).sort(compareStrings), competitions };
  }
  return { state: "KNOWN", boundObservationId: inView[0].recordId, candidateObservationIds: [], competitions };
}

/** The canonical evidence of every relevant key: each key's complete closure from the admitted observations, and its resolution. */
export function economicKeyEvidence(observations: readonly EconomicObservation[], valueKeys: readonly string[], effectiveAt: string, knowledgeCutoff: string): EconomicKeyEvidence[] | null {
  const out: EconomicKeyEvidence[] = [];
  for (const valueKey of [...new Set(valueKeys)].sort(compareStrings)) {
    const closure = observations.filter((o) => o.valueKey === valueKey && compareInstants(o.receivedAt, knowledgeCutoff) <= 0).sort(byObservationId);
    const resolution = resolveKeyEvidence(valueKey, closure, effectiveAt, knowledgeCutoff);
    if (resolution === null) return null;
    out.push({ valueKey, observations: closure, resolution });
  }
  return out;
}

export type EconomicValuationOutcome = { state: "VALUE_KNOWN"; amount: string; currency: string } | { state: "VALUE_UNKNOWN"; reasonCodes: string[] };

/**
 * THE canonical valuation of one candidate (`NET_OF_BOUND_OBSERVATIONS`), derived from canonical key evidence
 * only: the model, its value form, each key's role (a reference into the context's key evidence by `valueKey`),
 * the outcome, the observations summed (KNOWN only) and the complete consulted evidence — the union of the
 * referenced keys' closures. Candidate value, ranking, the pack's economic step, inputs and sources, the record and
 * the explanation are projections of this object; nothing re-collects economic evidence.
 */
export interface EconomicValuation {
  model: RecommendationModelRef;
  form: EconomicValueForm;
  keys: { valueKey: string; role: "benefit" | "cost" }[];
  outcome: EconomicValuationOutcome;
  usedObservationIds: string[];
  consulted: EconomicObservation[];
}

/**
 * `NET_OF_BOUND_OBSERVATIONS`: Σ benefit − Σ cost through `money.ts`.
 * REQUIRED: every named key KNOWN, one currency, a computable currency, within the arithmetic's precision.
 */
export function computeEconomicValuation(model: RecommendationModelRef, form: EconomicValueForm, evidence: readonly EconomicKeyEvidence[]): EconomicValuation {
  const byKey = new Map(evidence.map((e) => [e.valueKey, e]));
  const keys = [...form.benefitKeys.map((valueKey) => ({ valueKey, role: "benefit" as const })), ...form.costKeys.map((valueKey) => ({ valueKey, role: "cost" as const }))];
  const consulted = keys.flatMap((k) => byKey.get(k.valueKey)?.observations ?? []).sort(byObservationId);
  const base = { model, form, keys, consulted };
  const unknown = (reasonCodes: string[]): EconomicValuation => ({ ...base, outcome: { state: "VALUE_UNKNOWN", reasonCodes: [...reasonCodes].sort(compareStrings) }, usedObservationIds: [] });
  const reasons: string[] = [];
  const boundOf = (k: { valueKey: string }): EconomicObservation | null => {
    const e = byKey.get(k.valueKey);
    const o = e === undefined || e.resolution.state !== "KNOWN" ? undefined : e.observations.find((x) => x.observationId === e.resolution.boundObservationId);
    if (o === undefined) {
      reasons.push(`CATTLE_RECOMMENDATION_VALUE_INPUT_${e?.resolution.state ?? "UNKNOWN"}:${k.valueKey}`);
      return null;
    }
    return o;
  };
  const benefit = keys.filter((k) => k.role === "benefit").map(boundOf);
  const cost = keys.filter((k) => k.role === "cost").map(boundOf);
  if (reasons.length > 0) return unknown(reasons);
  const all = [...benefit, ...cost] as EconomicObservation[];
  const currencies = [...new Set(all.map((o) => o.currency))];
  if (currencies.length !== 1) return unknown([`CATTLE_RECOMMENDATION_VALUE_CURRENCY_MIXED:${currencies.sort(compareStrings).join(",")}`]);
  const currency = currencies[0];
  if (!(COMPUTABLE_CURRENCIES as readonly string[]).includes(currency)) return unknown([`CATTLE_RECOMMENDATION_VALUE_CURRENCY_NOT_COMPUTABLE:${currency}`]);
  // F006: Σ of N terms each below 10^k needs at most k + digits(N − 1) integer digits; if the exact result could exceed
  // the canonical arithmetic's precision, the value is unknown (fail closed) — never a rounded amount.
  const widths = all.map((o) => amountDigitWidth(o.amount));
  const bound = Math.max(...widths.map((w) => w.integer)) + (all.length <= 1 ? 0 : String(all.length - 1).length) + Math.max(...widths.map((w) => w.fraction));
  if (bound > MONEY_ARITHMETIC_PRECISION) return unknown([`CATTLE_RECOMMENDATION_VALUE_PRECISION_UNSUPPORTED:${bound}>${MONEY_ARITHMETIC_PRECISION}`]);
  const money = (o: EconomicObservation): MoneyAmount => createMoneyAmount(o.amount, currency as CurrencyCode);
  let total = zeroMoney(currency as CurrencyCode);
  for (const o of benefit as EconomicObservation[]) total = addMoney(total, money(o));
  for (const o of cost as EconomicObservation[]) total = subtractMoney(total, money(o));
  return { ...base, outcome: { state: "VALUE_KNOWN", amount: total.amount, currency }, usedObservationIds: all.map((o) => o.observationId).sort(compareStrings) };
}

// ---------------------------------------------------------------------------
// Projections — the ONLY ways economic evidence leaves the canonical objects
// ---------------------------------------------------------------------------

/** The candidate's decision value (ranking, the candidate step, the record and the explanation read only this). */
export function candidateValueOf(v: EconomicValuation): CandidateValue {
  return v.outcome.state === "VALUE_KNOWN"
    ? { state: "VALUE_KNOWN", model: v.model, amount: v.outcome.amount, currency: v.outcome.currency, observationIds: v.usedObservationIds, reasonCodes: ["CATTLE_RECOMMENDATION_ECONOMIC_MODEL_PASS"] }
    : { state: "VALUE_UNKNOWN", model: v.model, amount: null, currency: null, observationIds: [], reasonCodes: v.outcome.reasonCodes };
}

/** The pack calculation-step inputs of a valuation: its model, form and outcome, and each key's complete canonical evidence. */
export function valuationStepInputs(v: EconomicValuation, evidence: readonly EconomicKeyEvidence[]): Record<string, string> {
  const inputs: Record<string, string> = { model: JSON.stringify(v.model), form: JSON.stringify(v.form), outcome: JSON.stringify(v.outcome), usedObservationIds: JSON.stringify(v.usedObservationIds) };
  for (const k of v.keys) inputs[`${k.role}:${k.valueKey}`] = JSON.stringify(evidence.find((e) => e.valueKey === k.valueKey) ?? null);
  return inputs;
}

/** The pack input items of a valuation: every consulted observation (its key's complete closure). */
export function valuationInputItems(v: EconomicValuation): CattleInputItem[] {
  return v.consulted.map((o) => ({
    inputKey: `cattle.recommendation.economic.${o.valueKey}`,
    value: o.amount,
    unit: o.currency,
    informationClass: "OBSERVATION",
    provenance: { kind: "CANONICAL_RECORD", ref: o.observationId, recordedAt: o.receivedAt },
  }));
}

/** The source versions of every consulted observation. */
export function valuationSourceRefs(v: EconomicValuation): SourceVersionRef[] {
  return v.consulted.map((o) => o.source);
}

/** Exact comparison of two KNOWN values in one computable currency (`money.ts`); `null` when not comparable. */
export function compareKnownValues(a: { amount: string; currency: string }, b: { amount: string; currency: string }): -1 | 0 | 1 | null {
  if (a.currency !== b.currency || !(COMPUTABLE_CURRENCIES as readonly string[]).includes(a.currency)) return null;
  return compareMoney(createMoneyAmount(a.amount, a.currency as CurrencyCode), createMoneyAmount(b.amount, b.currency as CurrencyCode));
}
