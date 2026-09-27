/**
 * Campaign B (regulatory context, physical slurry identity, spreadable
 * area and minimum evidence checks) — the versioned context downstream
 * slurry recommendation work inspects, built on top of Campaign A's
 * `buildSlurryEvidenceContext` (same `EvidenceFact` semantics: `known`,
 * `missing` with a reason, or `conflicting` with every candidate kept).
 * Pure: it reads what the data layer already returns, never persists and
 * never calculates a slurry rate, total volume or ranking (Campaign D).
 *
 * - B1: a store's physical volume, its regulatory neat cattle slurry
 *   volume and its agronomic composition are three independent facts.
 *   Neat volume stays `missing` unless explicit evidence is supplied
 *   (persisted in `slurry_store_neat_evidence_records` —
 *   `regulatory-evidence-records.ts`); physical m³ is never read as
 *   neat 1:1 and no neat fraction is derived.
 * - B2: the farm's regulatory context is reported only as held. Nothing
 *   in the repo records derogation status, manure imports/exports or an
 *   adopted farm-level organic-N limit rule, so each is `missing` or
 *   blocked — never `false`/`0`/a generic limit.
 * - B3: gross mapped area is a geometric reference only. No exclusion
 *   geometry or approved buffer-to-area rule exists, so spreadable area
 *   is known only from a recorded declaration
 *   (`field_spreadable_area_records`) and otherwise stays `missing`: a
 *   TOTAL_VOLUME blocker, never a RATE blocker.
 * - B4: `evidenceChecks` lists what is unresolved, by layer, in plain
 *   language — asking only where Farm Return has somewhere to record the
 *   answer and does not already hold it, once per farm for farm-level
 *   facts and once (with an explicit field list) for field facts.
 *
 * See docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md §14.
 */

import type { DataStatus, Field, LivestockGroup } from "./types";
import type { EngineOutcome } from "./evidence";
import { blockedInsufficientEvidence } from "./evidence";
import {
  buildSlurryEvidenceContext,
  type BuildSlurryEvidenceContextInput,
  type EvidenceFact,
  type EvidenceSourceRef,
  type FieldSlurryEvidence,
  type SlurryEvidenceContext,
  type SlurryStoreEvidence,
} from "./slurry-evidence-context";
import { calculateStatutoryGrasslandStockingRateKgHa, STATUTORY_EXCRETION_VERSION, type StatutoryGsrResult } from "./statutory-excretion";
import { STATUTORY_MANURE_VALUE_VERSION } from "./statutory-manure-value";
import { SOIL_INDEX_PROVENANCE_VERSION } from "./soil-index-provenance";
import { SOIL_TEST_VALIDITY_VERSION } from "./soil-test-validity";
import { isActiveReservation, type SlurryAllocationRecord } from "./slurry-allocation-lifecycle";
import {
  isTiedEvidence,
  resolveSpreadableAreaHa,
  type CurrentEvidenceRecord,
  type SpreadableAreaRecord,
} from "./regulatory-evidence-records";

export const SLURRY_REGULATORY_CONTEXT_VERSION = "slurry_regulatory_context_v1.0.0";

/** The statutory rule set this context was built against — recorded so a
 * later rule change never rewrites what an earlier context meant. */
export const SLURRY_REGULATORY_RULESET = {
  version: SLURRY_REGULATORY_CONTEXT_VERSION,
  statutorySource: "S.I. No. 588/2025 (as amended by S.I. No. 119/2026) — docs/scientific-engine/v3/rules_statutory/",
  statutoryManureValueVersion: STATUTORY_MANURE_VALUE_VERSION,
  statutoryExcretionVersion: STATUTORY_EXCRETION_VERSION,
  soilIndexProvenanceVersion: SOIL_INDEX_PROVENANCE_VERSION,
  soilTestValidityVersion: SOIL_TEST_VALIDITY_VERSION,
} as const;

// ---------------------------------------------------------------------------
// B1 — physical slurry vs regulatory neat slurry
// ---------------------------------------------------------------------------

/** Explicit evidence of a store's neat cattle slurry volume
 * (`regulatoryNeatSlurryEvidenceFromRecord` maps a persisted record to
 * this). Evidence recorded as `unavailable` need not carry a volume. */
export type RegulatoryNeatSlurryEvidence =
  | (EvidenceSourceRef & { status: Exclude<DataStatus, "unavailable">; volumeM3: number })
  | (EvidenceSourceRef & { status: "unavailable"; volumeM3?: number });

export interface StoreSlurryIdentity {
  housingId: string;
  shedName: string;
  /** Phase 1A reconciled physical volume, exactly as Campaign A reports it. */
  physicalVolumeM3: EvidenceFact<number>;
  /** Regulatory neat cattle slurry in the store — independent of physical
   * volume and of composition. */
  regulatoryNeatVolumeM3: EvidenceFact<number>;
  /** Agronomic composition evidence — unchanged from Campaign A. */
  composition: Pick<SlurryStoreEvidence, "recordedDryMatterPct" | "recordedTotals">;
}

export function resolveRegulatoryNeatSlurryVolume(
  physical: EvidenceFact<number>,
  neat: CurrentEvidenceRecord<RegulatoryNeatSlurryEvidence> | undefined,
): EvidenceFact<number> {
  if (neat === undefined) return { state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" };
  // Contradictory records tied as current: none is chosen. Only known,
  // valid volumes can be candidates; a tied unavailable/invalid record
  // still blocks the known ones rather than being outvoted by them.
  if (isTiedEvidence(neat)) {
    return {
      state: "conflicting",
      reasonCode: "REGULATORY_NEAT_SLURRY_TIED_OBSERVATIONS_CONFLICT",
      candidates: neat.tied.flatMap(({ volumeM3, ...ref }) =>
        ref.status !== "unavailable" && volumeM3 !== undefined && Number.isFinite(volumeM3) && volumeM3 >= 0 ? [{ value: volumeM3, ...ref }] : [],
      ),
    };
  }
  // Evidence marked unavailable is not evidence, whatever number is
  // stored beside it — it never becomes a known statutory quantity.
  if (neat.status === "unavailable") return { state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" };
  const { volumeM3, ...ref } = neat;
  if (!Number.isFinite(volumeM3) || volumeM3 < 0) return { state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_INVALID" };
  // Neat slurry is part of what is physically in the store; evidence of
  // more neat slurry than physical volume contradicts the physical record.
  // Neither is chosen.
  if (physical.state === "known" && volumeM3 > physical.value) {
    return {
      state: "conflicting",
      reasonCode: "NEAT_SLURRY_EXCEEDS_PHYSICAL_VOLUME",
      candidates: [
        { value: volumeM3, ...ref },
        {
          value: physical.value,
          status: physical.status,
          source: physical.source,
          ...(physical.recordedAt !== undefined ? { recordedAt: physical.recordedAt } : {}),
          ...(physical.recordId !== undefined ? { recordId: physical.recordId } : {}),
        },
      ],
    };
  }
  return { state: "known", value: volumeM3, ...ref, freshness: "NO_FRESHNESS_POLICY" };
}

export function storeSlurryIdentity(
  store: SlurryStoreEvidence,
  neat: CurrentEvidenceRecord<RegulatoryNeatSlurryEvidence> | undefined,
): StoreSlurryIdentity {
  return {
    housingId: store.housingId,
    shedName: store.shedName,
    physicalVolumeM3: store.physicalVolumeM3,
    regulatoryNeatVolumeM3: resolveRegulatoryNeatSlurryVolume(store.physicalVolumeM3, neat),
    composition: { recordedDryMatterPct: store.recordedDryMatterPct, recordedTotals: store.recordedTotals },
  };
}

/** Lower = more trusted. `unavailable` never reaches a known fact. */
const NEAT_EVIDENCE_TRUST_RANK: Record<DataStatus, number> = { verified: 0, farmer_adjusted: 1, estimated: 2, mapped: 3, unavailable: 4 };

/** Why a contributing store cannot supply a planned neat quantity, least
 * usable first — a field fed by several stores reports the worst one. The
 * per-store detail stays on `SlurryRegulatoryContext.stores`. */
const UNRESOLVED_NEAT_REASON_RANK: readonly string[] = [
  "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE",
  "REGULATORY_NEAT_SLURRY_EVIDENCE_INVALID",
  "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED",
  "PLANNED_SHARE_OF_PARTLY_NEAT_STORE_NOT_ESTABLISHED",
];

function unresolvedNeatRank(fact: Exclude<EvidenceFact<number>, { state: "known" }>): number {
  // A conflict always outranks a missing reason; a reason this list does
  // not know is never treated as more usable than one it does.
  if (fact.state === "conflicting") return -1;
  const i = UNRESOLVED_NEAT_REASON_RANK.indexOf(fact.reasonCode);
  return i < 0 ? 0 : i;
}

/**
 * What `calculateNutrientPlan`'s `plannedRegulatoryNeatSlurry` may be for
 * a field. Known only when every contributing store's evidence shows its
 * whole physical volume is neat slurry (neat = physical), so the planned
 * physical m³ IS neat m³. Any partly-diluted store would need a fraction
 * applied to the allocation, and no approved rule says the planned share
 * has the store's average make-up — so it stays missing.
 *
 * Campaign B stabilisation 2: a store's own reason (unavailable, invalid,
 * not established) and a store conflict survive into the field fact —
 * never collapsed into a generic "not established". A field-level
 * conflict carries no candidate values: the store candidates are store
 * volumes, not planned field quantities, and no field figure is derived.
 */
export function fieldPlannedRegulatoryNeatSlurry(
  allocationRecords: readonly SlurryAllocationRecord[],
  fieldId: string,
  storeIdentityByHousing: ReadonlyMap<string, StoreSlurryIdentity>,
): EvidenceFact<number> {
  const planned = allocationRecords.filter((r) => isActiveReservation(r) && r.fieldId === fieldId && r.priority !== "not_suitable");
  if (planned.length === 0) return { state: "missing", reasonCode: "NO_PLANNED_SLURRY" };
  const sources: EvidenceSourceRef[] = [];
  const unresolved: Exclude<EvidenceFact<number>, { state: "known" }>[] = [];
  for (const housingId of [...new Set(planned.map((r) => r.housingId))].sort()) {
    const store = storeIdentityByHousing.get(housingId);
    const neat = store?.regulatoryNeatVolumeM3;
    const physical = store?.physicalVolumeM3;
    if (neat === undefined || physical === undefined) unresolved.push({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
    else if (neat.state === "conflicting") unresolved.push({ state: "conflicting", reasonCode: neat.reasonCode, candidates: [] });
    else if (neat.state === "missing") unresolved.push({ state: "missing", reasonCode: neat.reasonCode });
    else if (neat.status === "unavailable") unresolved.push({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE" });
    else if (physical.state !== "known") unresolved.push({ state: "missing", reasonCode: "REGULATORY_NEAT_SLURRY_NOT_ESTABLISHED" });
    else if (neat.value !== physical.value) unresolved.push({ state: "missing", reasonCode: "PLANNED_SHARE_OF_PARTLY_NEAT_STORE_NOT_ESTABLISHED" });
    else sources.push({ status: neat.status, source: neat.source, ...(neat.recordedAt ? { recordedAt: neat.recordedAt } : {}) });
  }
  if (unresolved.length > 0) return unresolved.reduce((worst, f) => (unresolvedNeatRank(f) < unresolvedNeatRank(worst) ? f : worst));
  const volumeM3 = planned.reduce((sum, r) => sum + r.volumeM3, 0);
  // The derived fact is only as trustworthy as its weakest source — never
  // upgraded (e.g. an estimate relabelled farmer_adjusted).
  const status = sources.map((s) => s.status).reduce((weakest, s) => (NEAT_EVIDENCE_TRUST_RANK[s] > NEAT_EVIDENCE_TRUST_RANK[weakest] ? s : weakest));
  return {
    state: "known",
    value: volumeM3,
    status,
    source: sources.map((s) => s.source).join("; "),
    ...(sources.length === 1 && sources[0].recordedAt ? { recordedAt: sources[0].recordedAt } : {}),
    freshness: "NO_FRESHNESS_POLICY",
  };
}

// ---------------------------------------------------------------------------
// B2 — farm regulatory context
// ---------------------------------------------------------------------------

export interface FarmRegulatoryContext {
  /** No derogation source is held; a farmer toggle is never accepted as
   * one (`gap_register.csv` GAP_DEROGATION_FULL_ELIGIBILITY). */
  derogationStatus: EvidenceFact<"derogation" | "no_derogation">;
  manureImports: EvidenceFact<{ nKg: number; pKg: number }>;
  manureExports: EvidenceFact<{ nKg: number; pKg: number }>;
  /** The existing statutory GSR as `calculateStatutoryGrasslandStockingRateKgHa`
   * returns it. Its basis is the CURRENT herd record, not the previous
   * calendar year the statute defines — disclosed, not corrected here. */
  statutoryGrasslandStockingRate: EngineOutcome<StatutoryGsrResult> & { basis: "current_herd_record_not_previous_year" };
  /** The farm-level livestock-manure organic-N limit. Not evaluated: the
   * adopted rule set does not encode it and derogation status is unknown,
   * so no generic limit is assumed. */
  organicNLimit: EngineOutcome<never>;
  /** How home-produced grazing-livestock manure P counts against the
   * Table 15a/15b P maxima — not in the adopted rule set (B2.2). */
  homeProducedManurePAccounting: EngineOutcome<never>;
}

export function buildFarmRegulatoryContext(livestockGroups: readonly LivestockGroup[], farmGrasslandAreaHa: number): FarmRegulatoryContext {
  return {
    derogationStatus: { state: "missing", reasonCode: "DEROGATION_STATUS_NOT_HELD" },
    manureImports: { state: "missing", reasonCode: "MANURE_IMPORTS_NOT_RECORDED" },
    manureExports: { state: "missing", reasonCode: "MANURE_EXPORTS_NOT_RECORDED" },
    statutoryGrasslandStockingRate: {
      ...calculateStatutoryGrasslandStockingRateKgHa([...livestockGroups], farmGrasslandAreaHa),
      basis: "current_herd_record_not_previous_year",
    },
    organicNLimit: blockedInsufficientEvidence("ORGANIC_N_LIMIT_RULE_NOT_ADOPTED", ["derogation status", "an adopted farm-level livestock-manure organic-N limit rule"]),
    homeProducedManurePAccounting: blockedInsufficientEvidence("HOME_PRODUCED_MANURE_P_ACCOUNTING_UNRESOLVED", [
      "the current statutory rule for counting home-produced grazing-livestock manure P against the Table 15 P maximum",
    ]),
  };
}

// ---------------------------------------------------------------------------
// B3 — gross vs spreadable area
// ---------------------------------------------------------------------------

export interface FieldSpreadableAreaEvidence {
  fieldId: string;
  /** Geometric reference only — never regulatory spreadable area. */
  grossMappedAreaHa: EvidenceFact<number>;
  knownExcludedAreaHa: EvidenceFact<number>;
  spreadableAreaHa: EvidenceFact<number>;
  /** Existing answers relevant to eligibility, reused as held. */
  exclusionEvidence: Pick<FieldSlurryEvidence, "commonageStatus" | "waterBufferContext">;
}

export function fieldSpreadableAreaEvidence(
  field: Field,
  evidence: Pick<FieldSlurryEvidence, "commonageStatus" | "waterBufferContext">,
  spreadableAreaRecord?: CurrentEvidenceRecord<SpreadableAreaRecord>,
): FieldSpreadableAreaEvidence {
  const areaKnown = Number.isFinite(field.areaHa) && field.areaHa > 0;
  const grossMappedAreaHa: EvidenceFact<number> = areaKnown
    ? {
        state: "known",
        value: field.areaHa,
        status: "estimated",
        source: field.polygon ? "Area of the mapped field boundary" : "Field area entered without a mapped boundary",
        ...(field.polygonCapturedAt ? { recordedAt: field.polygonCapturedAt } : {}),
        freshness: "NO_FRESHNESS_POLICY",
      }
    : { state: "missing", reasonCode: "FIELD_AREA_NOT_RECORDED" };
  return {
    fieldId: field.id,
    grossMappedAreaHa,
    // No exclusion geometry is held, and no approved rule turns a recorded
    // buffer distance into an excluded area (audit §12 item 15).
    knownExcludedAreaHa: { state: "missing", reasonCode: "NO_EXCLUSION_GEOMETRY_HELD" },
    // Only a recorded declaration — never the gross area.
    spreadableAreaHa: resolveSpreadableAreaHa(grossMappedAreaHa, spreadableAreaRecord),
    exclusionEvidence: { commonageStatus: evidence.commonageStatus, waterBufferContext: evidence.waterBufferContext },
  };
}

// ---------------------------------------------------------------------------
// B4 — evidence checks by blocking layer
// ---------------------------------------------------------------------------

export type EvidenceBlockerLayer =
  | "RATE_BLOCKING"
  | "COMPLIANCE_BLOCKING"
  | "TOTAL_VOLUME_BLOCKING"
  | "ECONOMIC_BLOCKING"
  | "ACTIONABILITY_BLOCKING"
  | "NON_BLOCKING";

export type EvidenceCheckFact =
  | "store_physical_volume"
  | "regulatory_neat_slurry"
  | "spreadable_area"
  | "derogation_status"
  | "commonage_status"
  | "water_buffer_context"
  | "soil_p_laboratory_evidence"
  | "slurry_dry_matter";

/** Where the farmer can record an answer today. `none` = Farm Return has
 * nowhere to hold it yet, so the gap is disclosed, not asked. */
export type EvidenceAnswerTarget = "housing_store" | "field_detail" | "soil_test" | "none";

export interface SlurryEvidenceCheck {
  fact: EvidenceCheckFact;
  scope: { kind: "farm" } | { kind: "fields"; fieldIds: string[] } | { kind: "stores"; housingIds: string[] };
  /** Why it is unresolved — conflicting/stale/legally-insufficient
   * evidence is never reported as simply absent. */
  state:
    | "missing"
    | "declared_unknown"
    | "conflicting"
    | "stale"
    | "not_legally_sufficient"
    /** Evidence is held, but a supporting fact needed to confirm it is
     * legally valid is not (e.g. a laboratory P Index with no sample date). */
    | "validity_unresolved"
    /** Current laboratory evidence is held, but a farmer override is the
     * working value — the override is not laboratory evidence. */
    | "override_of_valid_laboratory";
  layers: EvidenceBlockerLayer[];
  ask: boolean;
  answerTarget: EvidenceAnswerTarget;
  /** Farmer-facing, plain language. */
  message: string;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function formatM3(v: number): string {
  return `${Math.round(v).toLocaleString("en-IE")} m³`;
}

export function buildSlurryEvidenceChecks(input: {
  evidence: SlurryEvidenceContext;
  stores: readonly StoreSlurryIdentity[];
  spreadableArea: readonly FieldSpreadableAreaEvidence[];
  farm: FarmRegulatoryContext;
}): SlurryEvidenceCheck[] {
  const checks: SlurryEvidenceCheck[] = [];
  const fieldName = new Map(input.evidence.fields.map((f) => [f.fieldId, f.fieldName]));
  const namesOf = (ids: string[]) => listNames(ids.map((id) => fieldName.get(id) ?? id));

  // Stores — each store is its own physical fact.
  for (const store of input.stores) {
    if (store.physicalVolumeM3.state !== "known") {
      checks.push({
        fact: "store_physical_volume",
        scope: { kind: "stores", housingIds: [store.housingId] },
        state: "missing",
        layers: ["TOTAL_VOLUME_BLOCKING"],
        ask: true,
        answerTarget: "housing_store",
        message: `Farm Return does not yet know how much slurry is in ${store.shedName}. Record the tank's fill level to use it in a plan.`,
      });
    }
    const neat = store.regulatoryNeatVolumeM3;
    if (neat.state !== "known") {
      checks.push({
        fact: "regulatory_neat_slurry",
        scope: { kind: "stores", housingIds: [store.housingId] },
        state: neat.state === "conflicting" ? "conflicting" : "missing",
        layers: ["COMPLIANCE_BLOCKING"],
        ask: false,
        answerTarget: "none",
        message:
          neat.state === "conflicting" && neat.reasonCode === "REGULATORY_NEAT_SLURRY_TIED_OBSERVATIONS_CONFLICT"
            ? `Different neat cattle slurry figures were recorded for ${store.shedName} at the same time, so none of them is used for regulatory calculations.`
            : neat.state === "conflicting"
            ? `The neat cattle slurry recorded for ${store.shedName} is more than the slurry recorded in the tank, so neither figure is used for regulatory calculations.`
            : neat.reasonCode === "REGULATORY_NEAT_SLURRY_EVIDENCE_UNAVAILABLE"
              ? `The neat cattle slurry figure held for ${store.shedName} is marked as unavailable, so it is not used for regulatory calculations.`
              : store.physicalVolumeM3.state === "known"
              ? `Farm Return knows ${store.shedName} contains ${formatM3(store.physicalVolumeM3.value)}, but it does not yet know how much of that is neat cattle slurry for regulatory calculations.`
              : `Farm Return does not yet know how much neat cattle slurry ${store.shedName} holds for regulatory calculations.`,
      });
    }
  }

  // Farm-level facts — asked or disclosed once, never per field.
  if (input.farm.derogationStatus.state !== "known") {
    checks.push({
      fact: "derogation_status",
      scope: { kind: "farm" },
      state: "missing",
      layers: ["COMPLIANCE_BLOCKING"],
      ask: false,
      answerTarget: "none",
      message: "Farm Return does not hold this farm's nitrates derogation status, so the farm's organic nitrogen limit is not assessed yet.",
    });
  }

  // Field facts — one check per unresolved state, with the fields named.
  const group = (pick: (f: FieldSlurryEvidence) => SlurryEvidenceCheck["state"] | null) => {
    const byState = new Map<SlurryEvidenceCheck["state"], string[]>();
    for (const f of input.evidence.fields) {
      const s = pick(f);
      if (s !== null) byState.set(s, [...(byState.get(s) ?? []), f.fieldId]);
    }
    return byState;
  };

  for (const [state, ids] of group((f) =>
    f.commonageStatus.state === "known" ? null : f.commonageStatus.state === "missing" && f.commonageStatus.reasonCode === "COMMONAGE_STATUS_DECLARED_UNKNOWN" ? "declared_unknown" : "missing",
  )) {
    checks.push({
      fact: "commonage_status",
      scope: { kind: "fields", fieldIds: ids },
      state,
      layers: ["COMPLIANCE_BLOCKING"],
      // "Not sure" is already an answer — disclosed, not asked again.
      ask: state === "missing",
      answerTarget: "field_detail",
      message:
        state === "declared_unknown"
          ? `You recorded that you are not sure whether ${namesOf(ids)} ${ids.length === 1 ? "is" : "are"} commonage, so commonage rules cannot be checked there yet.`
          : `Is ${namesOf(ids)} commonage land? Farm Return has not recorded this yet.`,
    });
  }

  const bufferMissing = input.evidence.fields.filter((f) => f.waterBufferContext.state !== "known").map((f) => f.fieldId);
  if (bufferMissing.length > 0) {
    checks.push({
      fact: "water_buffer_context",
      scope: { kind: "fields", fieldIds: bufferMissing },
      state: "missing",
      layers: ["COMPLIANCE_BLOCKING"],
      ask: true,
      answerTarget: "field_detail",
      message: `Farm Return has not recorded whether ${namesOf(bufferMissing)} ${bufferMissing.length === 1 ? "is" : "are"} near a river, stream, lake or well.`,
    });
  }

  // Compliance eligibility is assessed on the retained laboratory node
  // (`soilTestAgeValidity` is already evaluated against it), separately
  // from the effective agronomic value a farmer override may supply.
  for (const [state, ids] of group((f) => {
    const p = f.soilIndex.p;
    if (p.basis === "missing") return "missing";
    if (p.basis !== "laboratory" && p.basis !== "farmer_override_of_laboratory") return "not_legally_sufficient";
    const validity = f.soilTestAgeValidity;
    if (validity.status !== "OK") return "validity_unresolved";
    if (validity.value === "DISREGARD") return "stale";
    return p.basis === "farmer_override_of_laboratory" ? "override_of_valid_laboratory" : null;
  })) {
    checks.push({
      fact: "soil_p_laboratory_evidence",
      scope: { kind: "fields", fieldIds: ids },
      state,
      // A missing P Index stops the agronomic rate too; a farmer figure
      // still drives the agronomy and only falls short for compliance.
      layers: state === "missing" ? ["RATE_BLOCKING", "COMPLIANCE_BLOCKING"] : ["COMPLIANCE_BLOCKING"],
      // The laboratory result is already held and current: nothing to ask.
      ask: state !== "override_of_valid_laboratory",
      answerTarget: state === "override_of_valid_laboratory" ? "none" : "soil_test",
      message:
        state === "missing"
          ? `No soil P Index is recorded for ${namesOf(ids)}. Add a soil test to plan nutrients there.`
          : state === "stale"
            ? `The soil test for ${namesOf(ids)} is now too old to set a statutory P limit. A new soil test is needed for that.`
            : state === "validity_unresolved"
              ? `A laboratory P Index is recorded for ${namesOf(ids)}, but not the date the soil sample was taken, so Farm Return cannot yet confirm it is recent enough to set a statutory P limit. Add the sample date from the soil test report.`
              : state === "override_of_valid_laboratory"
                ? `Your own P Index is being used for nutrient advice on ${namesOf(ids)}. A current laboratory soil test is also on file, but Farm Return does not yet set the statutory P limit from it while your figure is in use, so that limit is planning advice only.`
                : `The P Index for ${namesOf(ids)} is your own figure or an estimate, not a laboratory soil test. It is used for nutrient advice, but a soil test is needed before it can set a statutory P limit.`,
    });
  }

  const dmConflict = input.evidence.fields.filter((f) => f.slurryDryMatter.state === "conflicting").map((f) => f.fieldId);
  if (dmConflict.length > 0) {
    checks.push({
      fact: "slurry_dry_matter",
      scope: { kind: "fields", fieldIds: dmConflict },
      state: "conflicting",
      layers: ["RATE_BLOCKING"],
      ask: false,
      answerTarget: "none",
      message: `Slurry planned for ${namesOf(dmConflict)} comes from more than one tank with separate test results, and there is no approved way to combine them yet.`,
    });
  }

  // Spreadable area — field-specific, but the same unresolved reason for
  // every field, so disclosed once with the fields named.
  const areaUnknown = input.spreadableArea
    .filter((a) => a.spreadableAreaHa.state === "missing" && a.grossMappedAreaHa.state === "known")
    .map((a) => a.fieldId);
  const isTiedAreaConflict = (a: FieldSpreadableAreaEvidence) =>
    a.spreadableAreaHa.state === "conflicting" && a.spreadableAreaHa.reasonCode === "SPREADABLE_AREA_TIED_OBSERVATIONS_CONFLICT";
  const areaTied = input.spreadableArea.filter(isTiedAreaConflict).map((a) => a.fieldId);
  if (areaTied.length > 0) {
    checks.push({
      fact: "spreadable_area",
      scope: { kind: "fields", fieldIds: areaTied },
      state: "conflicting",
      layers: ["TOTAL_VOLUME_BLOCKING"],
      ask: false,
      answerTarget: "none",
      message: `Different spreadable areas were recorded for ${namesOf(areaTied)} at the same time, so none of them is used to work out a total slurry volume.`,
    });
  }
  const areaConflict = input.spreadableArea
    .filter((a) => a.spreadableAreaHa.state === "conflicting" && !isTiedAreaConflict(a))
    .map((a) => a.fieldId);
  if (areaConflict.length > 0) {
    checks.push({
      fact: "spreadable_area",
      scope: { kind: "fields", fieldIds: areaConflict },
      state: "conflicting",
      layers: ["TOTAL_VOLUME_BLOCKING"],
      ask: false,
      answerTarget: "none",
      message: `The spreadable area recorded for ${namesOf(areaConflict)} is more than the field's current size, so neither figure is used to work out a total slurry volume.`,
    });
  }
  if (areaUnknown.length > 0) {
    checks.push({
      fact: "spreadable_area",
      scope: { kind: "fields", fieldIds: areaUnknown },
      state: "missing",
      // A per-hectare rate does not need spreadable hectares.
      layers: ["TOTAL_VOLUME_BLOCKING"],
      ask: false,
      answerTarget: "none",
      message: `Field size is known for ${namesOf(areaUnknown)}, but the spreadable area has not yet been confirmed, so a total slurry volume cannot be worked out.`,
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

export interface SlurryRegulatoryContext {
  version: typeof SLURRY_REGULATORY_CONTEXT_VERSION;
  ruleset: typeof SLURRY_REGULATORY_RULESET;
  asOfDate: string;
  evidence: SlurryEvidenceContext;
  stores: StoreSlurryIdentity[];
  /** Per active field: planned neat slurry for `calculateNutrientPlan`. */
  plannedRegulatoryNeatSlurryByField: Record<string, EvidenceFact<number>>;
  spreadableArea: FieldSpreadableAreaEvidence[];
  farm: FarmRegulatoryContext;
  evidenceChecks: SlurryEvidenceCheck[];
}

export interface BuildSlurryRegulatoryContextInput extends BuildSlurryEvidenceContextInput {
  livestockGroups: readonly LivestockGroup[];
  /** Explicit neat-slurry evidence by store
   * (`regulatoryNeatSlurryEvidenceByHousing`). Absent = not established. */
  regulatoryNeatSlurryByHousing?: ReadonlyMap<string, CurrentEvidenceRecord<RegulatoryNeatSlurryEvidence>>;
  /** Current spreadable-area record by field (`currentSpreadableAreaByField`).
   * Absent = not established. */
  spreadableAreaByField?: ReadonlyMap<string, CurrentEvidenceRecord<SpreadableAreaRecord>>;
}

export function buildSlurryRegulatoryContext(input: BuildSlurryRegulatoryContextInput): SlurryRegulatoryContext {
  const evidence = buildSlurryEvidenceContext(input);
  const stores = evidence.stores.map((s) => storeSlurryIdentity(s, input.regulatoryNeatSlurryByHousing?.get(s.housingId)));
  const storeById = new Map(stores.map((s) => [s.housingId, s]));
  const fieldById = new Map(evidence.activeFields.map((f) => [f.id, f]));
  const spreadableArea = evidence.fields.map((f) => fieldSpreadableAreaEvidence(fieldById.get(f.fieldId)!, f, input.spreadableAreaByField?.get(f.fieldId)));
  const farm = buildFarmRegulatoryContext(input.livestockGroups, evidence.farmGrasslandAreaHa);
  return {
    version: SLURRY_REGULATORY_CONTEXT_VERSION,
    ruleset: SLURRY_REGULATORY_RULESET,
    asOfDate: input.asOfDate,
    evidence,
    stores,
    plannedRegulatoryNeatSlurryByField: Object.fromEntries(
      evidence.fields.map((f) => [f.fieldId, fieldPlannedRegulatoryNeatSlurry(input.allocationRecords, f.fieldId, storeById)]),
    ),
    spreadableArea,
    farm,
    evidenceChecks: buildSlurryEvidenceChecks({ evidence, stores, spreadableArea, farm }),
  };
}
