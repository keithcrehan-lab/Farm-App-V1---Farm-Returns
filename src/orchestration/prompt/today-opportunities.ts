/**
 * Farm-Topic Notification Aggregation V1/V2/V3 (2026-09-19) — Today's
 * notification architecture moves from FIELD-LEVEL repetition (a
 * separate Prompt/card per field) to FARM-TOPIC aggregation: at most one
 * active `TodayOpportunity` per category (Slurry, Lime, Fertiliser,
 * Soil), regardless of how many individual fields that category's real
 * facts touch. A farm where ten fields each have their own real slurry
 * closed-period Prompt still produces exactly one Slurry
 * `TodayOpportunity` — the field-level records (`fields` below,
 * `affectedFieldIds`) stay fully available and scientifically
 * traceable, they just no longer each get their own top-level card.
 *
 * This module is the ONE place a category's Today opportunity is built
 * — `today/page.tsx`'s category cards AND the priority tracker tile
 * both read `buildTodayOpportunities()`'s output, never two independently
 * computed copies.
 *
 * Each builder below aggregates already-canonical downstream outputs —
 * real `Prompt`s from `buildAllRealPrompts` (Slurry/Fertiliser/Soil) or
 * the real `FarmLimeRequirement` (`aggregateFarmLimeRequirement`, Lime)
 * — and never recomputes or invents a scientific, regulatory or
 * financial figure of its own.
 *
 * V2 correction: CATEGORY MEMBERSHIP (`relevant`/`fieldRows` below) and
 * CATEGORY PRIORITY are separate concepts. Membership is every field
 * this category's Prompt kind genuinely applies to, independent of each
 * field's own status; this is unchanged by V3 and must stay that way
 * (see `docs/farm-return-next` checkpoint history — this correction is
 * explicitly not to be re-broken by later priority work).
 *
 * V3 (Today Opportunity Priority Engine): priority is no longer
 * inherited from one representative field's own status
 * (`selectPrimaryPrompt` + `priorityForEngineStatus`, the V1/V2
 * transitional approach). Each builder now reduces its own real,
 * aggregated facts (open/closed/evidence-gap counts, a real legal
 * blocker, a real evidence-confidence tier) to exactly one
 * `PrioritySituation` (`today-priority-engine.ts`) describing the whole
 * category's own state — never "which field is worst". See that
 * module's own doc comment for the shared precedence table, and each
 * builder below for its own category-specific V1 rules (section 4 of
 * this checkpoint's brief).
 *
 * **Known, disclosed limitations — not fixed by this increment**:
 * - Lime and Soil can never reach `HIGH`: no real, already-computed
 *   time-sensitive signal exists for either in this codebase today (no
 *   statutory lime-application deadline; no statutory soil-test renewal
 *   deadline, only the existing 4-year disregard rule, which is a
 *   present-tense disqualification, not a countdown). Manufacturing one
 *   would mean inventing a scientific/product threshold this
 *   checkpoint's own brief explicitly forbids — flagged as a real
 *   open decision for a domain/product owner, not silently resolved.
 * - Slurry composition confidence (`SlurryCompositionStatus`,
 *   `src/domain/slurry-composition.ts` — "verified" vs "farmer_adjusted")
 *   is real but does not currently reach `Prompt.basis`/`inputsSnapshot`
 *   for `fertiliser_recommendation` or the slurry spreading-window
 *   Prompt, so this engine cannot yet cite it — Slurry's own
 *   `evidenceSummary` falls back to the shared `EvidenceState` tier on
 *   its own Prompts only.
 */
import { SPREADING_WINDOW_PROMPT_KIND } from "./spreading-window";
import { FERTILISER_RECOMMENDATION_PROMPT_KIND } from "./fertiliser-recommendation";
import { SOIL_TEST_AGE_PROMPT_KIND } from "./soil-test-age";
import { priorityForEngineStatus, type TodayPriority } from "./today-priority";
import { resolveFarmPriority, type PrioritySituation } from "./today-priority-engine";
import { EVIDENCE_STATE_PRIORITY, EVIDENCE_STATE_UI_LABEL, type EvidenceState } from "@/domain/evidence";
import { formatNumber } from "@/lib/format";
import type { Prompt } from "./index";
import type { FarmLimeRequirement } from "@/domain/fertiliser-plan";
import type { Field } from "@/domain/types";

export type TodayOpportunityCategory = "slurry" | "lime" | "fertiliser" | "soil";

/** One already-real field's own reason for appearing in this category's
 * breakdown — `detail` is verbatim, already-produced copy (a Prompt's
 * own `description`, or a lime line built the same way
 * `FarmLimeRequirementCard` already formats one), never new prose about
 * a number this module computed itself. */
export interface TodayOpportunityFieldRow {
  fieldId: string;
  fieldName: string;
  detail: string;
  /** The real `Prompt` this row's own real evidence lives on — present
   * only for categories with an actual Prompt producer (Slurry,
   * Fertiliser, Soil), absent for Lime (no `Prompt` exists for it yet).
   * Lets a caller offer "View scientific basis" by reopening the
   * existing `ExpandedPromptSheet` for this exact Prompt, never a new
   * evidence view built for this increment. */
  sourcePrompt?: Prompt;
}

export interface TodayOpportunityMetric {
  label: string;
  value: string;
}

export interface TodayOpportunity {
  category: TodayOpportunityCategory;
  categoryLabel: string;
  priority: TodayPriority;
  priorityLabel: string;
  /** Real, farmer-legible facts explaining why this opportunity exists
   * and why it carries this priority — "Why this priority?" drill-down
   * material (not necessarily shown on the compact card itself). Never
   * a numeric score. */
  priorityReasons: string[];
  /** Real, farmer-legible facts currently constraining action — a legal
   * restriction, an evidence gap. Empty when nothing is blocking it. */
  blockers: string[];
  /** A short, real evidence-confidence summary where one already exists
   * (this app's own `EvidenceState` vocabulary) — `undefined` when no
   * real evidence tier applies. */
  evidenceSummary?: string;
  headline: string;
  /** A real, farm-wide ambient status line where one already exists
   * (e.g. the chemical-fertiliser/slurry closed-period chip text) —
   * never a per-field description mis-generalised to the whole farm. */
  summary?: string;
  /** Real, already-canonical numeric facts only — empty when nothing
   * real exists yet, never a fabricated placeholder metric. */
  metrics: TodayOpportunityMetric[];
  /** Every field this category's Prompt kind genuinely applies to —
   * CATEGORY MEMBERSHIP, independent of each field's own individual
   * status and of the category's own overall priority. */
  affectedFieldCount: number;
  affectedFieldIds: string[];
  /** Full field-level breakdown for the drill-down sheet — the
   * scientifically traceable detail this farm-topic card collapses out
   * of the top-level Today feed, not out of existence. */
  fields: TodayOpportunityFieldRow[];
}

function pluraliseFields(count: number): string {
  return count === 1 ? "field" : "fields";
}

/** Singular/plural verb agreement for reason/headline copy — `count`
 * fields is always plural except exactly 1. */
function verb(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** The generic, always-accurate fallback headline for a category whose
 * affected fields span more than one real status — see each builder's
 * own headline logic for when a more specific, truthful claim is used
 * instead (every relevant field sharing the same real status). */
function affectedHeadline(count: number): string {
  return `${count} ${pluraliseFields(count)} affected`;
}

function fieldRowsFor(prompts: readonly Prompt[], fields: readonly Pick<Field, "id" | "name">[]): TodayOpportunityFieldRow[] {
  const nameById = new Map(fields.map((f) => [f.id, f.name]));
  const seen = new Set<string>();
  const rows: TodayOpportunityFieldRow[] = [];
  for (const prompt of prompts) {
    if (!prompt.fieldId || seen.has(prompt.fieldId)) continue;
    seen.add(prompt.fieldId);
    rows.push({ fieldId: prompt.fieldId, fieldName: nameById.get(prompt.fieldId) ?? "Field", detail: prompt.description, sourcePrompt: prompt });
  }
  return rows;
}

/** The real status of the Prompt behind one field row — every row this
 * module builds via `fieldRowsFor` always has one (Lime's own rows,
 * built separately, never call this). */
function rowStatus(row: TodayOpportunityFieldRow) {
  return row.sourcePrompt!.basis.status;
}

/** The weakest real `EvidenceState` among a set of OK Prompts, in this
 * app's own already-existing tier label (`EVIDENCE_STATE_UI_LABEL`) —
 * reuses `EVIDENCE_STATE_PRIORITY` (defined in `src/domain/evidence.ts`,
 * previously unconsumed anywhere) as the one real, existing ranking for
 * "weakest", never a new confidence vocabulary. `undefined` when no OK
 * Prompt exists to summarise (e.g. a pure evidence-gap or fully-blocked
 * situation has no evidence tier to report). */
function weakestEvidenceStateLabel(prompts: readonly Prompt[]): string | undefined {
  let weakest: EvidenceState | undefined;
  for (const p of prompts) {
    if (p.basis.status !== "OK") continue;
    const es = p.basis.evidenceState;
    if (!weakest || EVIDENCE_STATE_PRIORITY[es] > EVIDENCE_STATE_PRIORITY[weakest]) weakest = es;
  }
  return weakest ? EVIDENCE_STATE_UI_LABEL[weakest] : undefined;
}

/**
 * Slurry: the farm's own real spreading-window Prompts for the slurry
 * material only (`organic_fertiliser_other_than_FYM`) — the same
 * material split `today/page.tsx`'s own ambient chip already uses, never
 * chemical fertiliser's Prompts.
 *
 * MEMBERSHIP (`relevant`) is every field with a real slurry
 * spreading-window Prompt at all (unchanged from the V2 correction —
 * every status this Prompt kind can return is a genuine, relevant fact).
 *
 * PRIORITY (V3): a real, currently-open spreading window on at least one
 * relevant field is this category's one real time-sensitive fact (the
 * statutory calendar toggles open/closed — genuinely time-limited, not
 * invented) -> `actionable_time_sensitive` (`HIGH`). No field open but at
 * least one is in the real statutory closed period -> `blocked`
 * (`MEDIUM`) — a real, meaningful opportunity, just not actionable right
 * now, kept visible for planning rather than silently downgraded to
 * "nothing to see". Only ambiguous/unknown real facts -> `weak_evidence`
 * (`LOW`). Only real evidence gaps -> `evidence_gap` (`VERY_LOW`).
 * `LEGAL_PROHIBITION`/`OK` for this Prompt kind are both confident,
 * fully-evidenced statutory facts (`spreading-window.ts`'s own doc
 * comment — never their own evidence-tier concern), so this category's
 * `evidenceSummary` only ever reflects the weakest real `EvidenceState`
 * among its `OK` Prompts, when any exist.
 *
 * `slurryStorage` (real tank capacity/volume, `buildFarmSlurryStorageOverview`
 * — `src/domain/slurry-storage.ts`) is optional and only surfaces as a
 * metric when the farm has real housing/storage data on file
 * (`totalCapacityM3 > 0`) and at least one field is genuinely open —
 * never a fabricated "0 available" for a farm with no real storage
 * records, and never gated on the category's own priority band (section
 * 1: priority must not gate what real data is shown).
 */
export function buildSlurryOpportunity(
  allPrompts: readonly Prompt[],
  fields: readonly Pick<Field, "id" | "name">[],
  slurryStorage?: { totalUnallocatedM3: number; totalCapacityM3: number },
  slurryAmbientStatus?: string,
): TodayOpportunity | undefined {
  const slurryPrompts = allPrompts.filter(
    (p) => p.kind === SPREADING_WINDOW_PROMPT_KIND && p.inputsSnapshot?.material === "organic_fertiliser_other_than_FYM",
  );
  const relevant = slurryPrompts.filter((p) => priorityForEngineStatus(p.basis.status) !== undefined);
  if (relevant.length === 0) return undefined;

  const fieldRows = fieldRowsFor(relevant, fields);
  const count = fieldRows.length;
  const openRows = fieldRows.filter((r) => rowStatus(r) === "OK");
  const closedRows = fieldRows.filter((r) => rowStatus(r) === "LEGAL_PROHIBITION");
  const evidenceGapRows = fieldRows.filter((r) => rowStatus(r) === "BLOCKED_INSUFFICIENT_EVIDENCE");
  const ambiguousRows = fieldRows.filter((r) => rowStatus(r) === "AMBIGUOUS" || rowStatus(r) === "UNKNOWN");

  const situation: PrioritySituation =
    openRows.length > 0
      ? "actionable_time_sensitive"
      : closedRows.length > 0
        ? "blocked"
        : ambiguousRows.length > 0
          ? "weak_evidence"
          : "evidence_gap";

  const reasons: string[] = [];
  if (openRows.length > 0) reasons.push(`${openRows.length} of ${count} ${pluraliseFields(count)} ${verb(openRows.length, "has", "have")} a real, currently open slurry spreading window`);
  const blockers: string[] = [];
  if (closedRows.length > 0) blockers.push(`${closedRows.length} ${pluraliseFields(closedRows.length)} ${verb(closedRows.length, "is", "are")} in the statutory slurry closed period`);
  if (evidenceGapRows.length > 0) blockers.push(`${evidenceGapRows.length} ${pluraliseFields(evidenceGapRows.length)} missing the evidence needed to determine spreading-window status`);

  const resolution = resolveFarmPriority(situation, reasons, blockers, weakestEvidenceStateLabel(relevant));

  // An open statutory window is a regulatory fact, not an audited economic
  // opportunity — only What Matters' own pipeline can establish one — so
  // the headline states just the window.
  const headline =
    openRows.length === count
      ? `Spreading open on ${count} ${pluraliseFields(count)}`
      : closedRows.length === count
        ? `${count} ${pluraliseFields(count)} in the slurry closed period`
        : evidenceGapRows.length === count
          ? `${count} ${pluraliseFields(count)} missing slurry spreading evidence`
          : affectedHeadline(count);

  const metrics: TodayOpportunityMetric[] = [];
  if (openRows.length > 0 && slurryStorage && slurryStorage.totalCapacityM3 > 0) {
    metrics.push({ label: "Volume available to allocate", value: `${formatNumber(slurryStorage.totalUnallocatedM3, 0)} m³` });
  }

  return {
    category: "slurry",
    categoryLabel: "Slurry",
    priority: resolution.priority,
    priorityLabel: resolution.priorityLabel,
    priorityReasons: resolution.reasons,
    blockers: resolution.blockers,
    evidenceSummary: resolution.evidenceSummary,
    headline,
    summary: slurryAmbientStatus,
    metrics,
    affectedFieldCount: count,
    affectedFieldIds: fieldRows.map((f) => f.fieldId),
    fields: fieldRows,
  };
}

/**
 * Fertiliser: the farm's own real fertiliser-recommendation Prompts.
 * MEMBERSHIP excludes only this Prompt kind's own genuine "doesn't
 * apply" arm (`NOT_APPLICABLE`) — unchanged from the V2 correction.
 *
 * PRIORITY (V3): a real, calculated nutrient requirement (`OK`) on at
 * least one relevant field, while chemical fertiliser is NOT currently
 * closed, is this category's real time-sensitive fact (the same real,
 * toggling statutory calendar Slurry uses) -> `actionable_time_sensitive`
 * (`HIGH`). The same real requirement while chemical fertiliser IS
 * currently closed -> `blocked` (`MEDIUM`) — section 4/7 of this
 * checkpoint's brief, explicit: a real nutrient need that cannot
 * currently be acted on because the legal spreading period is closed
 * must not present as `HIGH` merely because the need is real or large,
 * and the closed period is a blocker/context input, never the whole
 * priority. Only ambiguous/unknown real facts -> `weak_evidence`
 * (`LOW`). Only real evidence gaps (missing soil/livestock data) ->
 * `evidence_gap` (`VERY_LOW`).
 *
 * `chemicalFertiliserClosed`/`chemicalFertiliserAmbientStatus` are the
 * same real, already-computed farm-wide closed-period facts
 * `today/page.tsx`'s own ambient chip already uses — never a per-field
 * closed-period Prompt re-surfaced as its own separate notification;
 * exactly the "one farm-level restriction is enough" rule the brief
 * states explicitly.
 */
export function buildFertiliserOpportunity(
  allPrompts: readonly Prompt[],
  fields: readonly Pick<Field, "id" | "name">[],
  chemicalFertiliserAmbientStatus?: string,
  chemicalFertiliserClosed?: boolean,
): TodayOpportunity | undefined {
  const fertiliserPrompts = allPrompts.filter((p) => p.kind === FERTILISER_RECOMMENDATION_PROMPT_KIND);
  const relevant = fertiliserPrompts.filter((p) => priorityForEngineStatus(p.basis.status) !== undefined);
  if (relevant.length === 0) return undefined;

  const fieldRows = fieldRowsFor(relevant, fields);
  const count = fieldRows.length;
  const okRows = fieldRows.filter((r) => rowStatus(r) === "OK");
  const evidenceGapRows = fieldRows.filter((r) => rowStatus(r) === "BLOCKED_INSUFFICIENT_EVIDENCE");
  const ambiguousRows = fieldRows.filter((r) => rowStatus(r) === "AMBIGUOUS" || rowStatus(r) === "UNKNOWN");
  const closed = Boolean(chemicalFertiliserClosed);

  const situation: PrioritySituation =
    okRows.length > 0 ? (closed ? "blocked" : "actionable_time_sensitive") : ambiguousRows.length > 0 ? "weak_evidence" : "evidence_gap";

  const reasons: string[] = [];
  if (okRows.length > 0) reasons.push(`${okRows.length} of ${count} ${pluraliseFields(count)} ${verb(okRows.length, "has", "have")} a real, calculated nutrient requirement`);
  const blockers: string[] = [];
  if (okRows.length > 0 && closed) blockers.push("Chemical fertiliser is currently in the statutory closed period");
  if (evidenceGapRows.length > 0) blockers.push(`${evidenceGapRows.length} ${pluraliseFields(evidenceGapRows.length)} missing the evidence needed for a nutrient recommendation`);

  const resolution = resolveFarmPriority(situation, reasons, blockers, weakestEvidenceStateLabel(relevant));

  const headline =
    okRows.length === count
      ? `${count} ${pluraliseFields(count)} have outstanding nutrient requirements`
      : evidenceGapRows.length === count
        ? `${count} ${pluraliseFields(count)} missing evidence for a nutrient recommendation`
        : affectedHeadline(count);

  return {
    category: "fertiliser",
    categoryLabel: "Fertiliser",
    priority: resolution.priority,
    priorityLabel: resolution.priorityLabel,
    priorityReasons: resolution.reasons,
    blockers: resolution.blockers,
    evidenceSummary: resolution.evidenceSummary,
    headline,
    summary: chemicalFertiliserAmbientStatus,
    metrics: [],
    affectedFieldCount: count,
    affectedFieldIds: fieldRows.map((f) => f.fieldId),
    fields: fieldRows,
  };
}

/**
 * Soil: the farm's own real soil-test-age Prompts. `soil-test-age.ts`'s
 * own producer documents `NOT_APPLICABLE` as "no lab test at all" for
 * this one Prompt kind — a real, disclosed evidence gap, not "the check
 * doesn't apply here" — so, uniquely for Soil, MEMBERSHIP is every field
 * with a `soil_test_age` Prompt at all (unchanged from the V2
 * correction).
 *
 * PRIORITY (V3) — this checkpoint's own explicit correction: a real,
 * current, valid soil test (`OK`/`VALID` or `OK`/`INDEX4_PERSISTED`) is
 * NOT itself an urgent opportunity (section 4: "do not treat 'current/
 * valid soil test exists' as Medium simply because the existing Prompt
 * status maps OK -> MEDIUM — that transitional behaviour should be
 * removed"). Differentiated here as three real, distinct farm-level
 * situations:
 * - every relevant field genuinely healthy (`VALID`/`INDEX4_PERSISTED`)
 *   -> `healthy` (`LOW`) — real, informational, not urgent.
 * - at least one field's test is real but disregarded
 *   (`OK`/`DISREGARD` — "can no longer be used for nutrient planning",
 *   the statutory 4-year rule) -> `actionable` (`MEDIUM`) — a real,
 *   actionable problem. Not `actionable_time_sensitive`/`HIGH`: no real,
 *   already-computed renewal deadline or "years until expiry" concept
 *   exists anywhere in `soil-test-validity.ts`/`field-soil-test-age.ts`
 *   today (only the raw `sampleDate` and the fixed 4-year constant), so
 *   inventing an urgency countdown here would be exactly the kind of
 *   scientific threshold this checkpoint's brief forbids — flagged as a
 *   real open decision, not silently resolved.
 * - only ambiguous/unknown real facts -> `weak_evidence` (`LOW`).
 * - only real evidence gaps (`BLOCKED_INSUFFICIENT_EVIDENCE` or
 *   `NOT_APPLICABLE`) -> `evidence_gap` (`VERY_LOW`).
 * A genuine mix (e.g. some healthy, some missing evidence, no
 * disregarded test) falls to whichever real situation is most
 * significant among those present — disregard outranks ambiguity
 * outranks evidence gap outranks healthy — a real, farm-level judgement
 * about which fact is most worth the farmer's attention, never "the
 * worst field's own status".
 */
export function buildSoilOpportunity(allPrompts: readonly Prompt[], fields: readonly Pick<Field, "id" | "name">[]): TodayOpportunity | undefined {
  const soilPrompts = allPrompts.filter((p) => p.kind === SOIL_TEST_AGE_PROMPT_KIND);
  if (soilPrompts.length === 0) return undefined;

  const fieldRows = fieldRowsFor(soilPrompts, fields);
  const count = fieldRows.length;
  const rowValue = (r: TodayOpportunityFieldRow) => {
    const basis = r.sourcePrompt!.basis;
    return basis.status === "OK" ? basis.value : undefined;
  };
  const disregardRows = fieldRows.filter((r) => rowValue(r) === "DISREGARD");
  const healthyRows = fieldRows.filter((r) => rowStatus(r) === "OK" && rowValue(r) !== "DISREGARD");
  const evidenceGapRows = fieldRows.filter((r) => rowStatus(r) === "BLOCKED_INSUFFICIENT_EVIDENCE" || rowStatus(r) === "NOT_APPLICABLE");
  const ambiguousRows = fieldRows.filter((r) => rowStatus(r) === "AMBIGUOUS" || rowStatus(r) === "UNKNOWN");
  const allHealthy = healthyRows.length === count;

  const situation: PrioritySituation = allHealthy
    ? "healthy"
    : disregardRows.length > 0
      ? "actionable"
      : ambiguousRows.length > 0
        ? "weak_evidence"
        : "evidence_gap";

  const reasons: string[] = [];
  if (disregardRows.length > 0) {
    reasons.push(
      `${disregardRows.length} of ${count} ${pluraliseFields(count)} ${verb(disregardRows.length, "has", "have")} a soil test that can no longer be used for nutrient planning (statutory 4-year disregard rule)`,
    );
  } else if (allHealthy) {
    reasons.push(`${count} ${pluraliseFields(count)} ${verb(count, "has", "have")} a current, valid soil test on file`);
  }
  const blockers: string[] = [];
  if (evidenceGapRows.length > 0) blockers.push(`${evidenceGapRows.length} ${pluraliseFields(evidenceGapRows.length)} missing soil-test evidence`);

  const relevantOkPrompts = fieldRows.filter((r) => rowStatus(r) === "OK").map((r) => r.sourcePrompt!);
  const resolution = resolveFarmPriority(situation, reasons, blockers, weakestEvidenceStateLabel(relevantOkPrompts));

  const headline = allHealthy
    ? `${count} ${pluraliseFields(count)} ${verb(count, "has", "have")} a current soil test on file`
    : disregardRows.length === count
      ? `${count} ${pluraliseFields(count)} need updated soil information`
      : evidenceGapRows.length === count
        ? `${count} ${pluraliseFields(count)} have incomplete soil evidence`
        : affectedHeadline(count);

  return {
    category: "soil",
    categoryLabel: "Soil",
    priority: resolution.priority,
    priorityLabel: resolution.priorityLabel,
    priorityReasons: resolution.reasons,
    blockers: resolution.blockers,
    evidenceSummary: resolution.evidenceSummary,
    headline,
    metrics: [],
    affectedFieldCount: count,
    affectedFieldIds: fieldRows.map((f) => f.fieldId),
    fields: fieldRows,
  };
}

/**
 * Lime: no `Prompt` producer exists for lime yet, so this reads the same
 * `FarmLimeRequirement` shape `FarmLimeRequirementCard` already renders
 * verbatim (`getFarmLimeRequirementAction` -> `aggregateFarmLimeRequirement`),
 * never a second lime calculation.
 *
 * MEMBERSHIP is the union of every field with a real requirement
 * (`fieldTonnes > 0`) AND every field missing lime evidence (`rateTHa`
 * undefined) — unchanged from the V2 correction. A field with complete
 * evidence and a genuine zero requirement stays excluded — nothing real
 * to report for it.
 *
 * PRIORITY (V3) — section 4's explicit V1 principle: "a real, actionable
 * lime requirement should rank above a pure evidence gap. Missing lime
 * evidence alone should not be treated the same as a verified lime
 * requirement." At least one field with a real, verified laboratory
 * requirement -> `actionable` (`MEDIUM`). Only missing evidence, no real
 * requirement anywhere -> `evidence_gap` (`VERY_LOW`). Never
 * `actionable_time_sensitive`/`HIGH`: no real, already-computed
 * statutory lime-application deadline or tonnage-based urgency threshold
 * exists anywhere in this codebase — inventing one (e.g. "X tonnes =
 * High") is exactly what section 4 forbids — flagged as a real open
 * decision, not silently resolved. `evidenceSummary` is a plain real
 * statement, not the shared `EvidenceState` vocabulary (lime has no
 * `Prompt`/`EngineOutcome` to read one from).
 */
export function buildLimeOpportunity(limeRequirement: FarmLimeRequirement | undefined): TodayOpportunity | undefined {
  if (!limeRequirement) return undefined;

  const fieldsWithLime = limeRequirement.fields.filter((f) => f.fieldTonnes !== undefined && f.fieldTonnes > 0);
  const fieldsMissingEvidence = limeRequirement.fields.filter((f) => f.rateTHa === undefined);
  if (fieldsWithLime.length === 0 && fieldsMissingEvidence.length === 0) return undefined;

  const relevantFields = [...fieldsWithLime, ...fieldsMissingEvidence];
  const count = relevantFields.length;
  const situation: PrioritySituation = fieldsWithLime.length > 0 ? "actionable" : "evidence_gap";

  const reasons: string[] = [];
  if (fieldsWithLime.length > 0) {
    reasons.push(
      `${fieldsWithLime.length} of ${count} ${pluraliseFields(count)} ${verb(fieldsWithLime.length, "has", "have")} a verified laboratory lime requirement totalling ${formatNumber(limeRequirement.farmTotalTonnes, 2)} t`,
    );
  }
  const blockers: string[] = [];
  if (fieldsMissingEvidence.length > 0) blockers.push(`${fieldsMissingEvidence.length} ${pluraliseFields(fieldsMissingEvidence.length)} missing laboratory lime evidence`);

  const resolution = resolveFarmPriority(situation, reasons, blockers, fieldsWithLime.length > 0 ? "Verified laboratory evidence" : undefined);

  const headline =
    fieldsMissingEvidence.length === 0
      ? `${count} ${pluraliseFields(count)} ${verb(count, "has", "have")} a verified lime requirement`
      : fieldsWithLime.length === 0
        ? `${count} ${pluraliseFields(count)} ${verb(count, "is", "are")} missing lime evidence`
        : affectedHeadline(count);

  return {
    category: "lime",
    categoryLabel: "Lime",
    priority: resolution.priority,
    priorityLabel: resolution.priorityLabel,
    priorityReasons: resolution.reasons,
    blockers: resolution.blockers,
    evidenceSummary: resolution.evidenceSummary,
    headline,
    metrics: fieldsWithLime.length > 0 ? [{ label: "Total requirement", value: `${formatNumber(limeRequirement.farmTotalTonnes, 2)} t` }] : [],
    affectedFieldCount: count,
    affectedFieldIds: relevantFields.map((f) => f.fieldId),
    fields: [
      ...fieldsWithLime.map((f) => ({
        fieldId: f.fieldId,
        fieldName: f.fieldName,
        // No lime `Prompt` exists (this module's own header) so there is
        // no separate evidence tier to cite here — `rateTHa` only ever
        // comes from `field.fertility.verifiedTest.limeRequirement`
        // (`aggregateFarmLimeRequirement`'s own doc comment), i.e. this
        // real figure is always a verified lab result, never estimated
        // or farmer-adjusted; stated plainly since that provenance isn't
        // otherwise visible on this row.
        detail: `Verified lab test · ${formatNumber(f.rateTHa!, 2)} t/ha · ${formatNumber(f.fieldTonnes!, 2)} t total (${formatNumber(f.areaHa, 2)} ha)`,
      })),
      ...fieldsMissingEvidence.map((f) => ({ fieldId: f.fieldId, fieldName: f.fieldName, detail: "No real laboratory lime figure on file" })),
    ],
  };
}

export interface BuildTodayOpportunitiesInput {
  allPrompts: readonly Prompt[];
  fields: readonly Pick<Field, "id" | "name">[];
  limeRequirement: FarmLimeRequirement | undefined;
  slurryStorage?: { totalUnallocatedM3: number; totalCapacityM3: number };
  slurryAmbientStatus?: string;
  chemicalFertiliserAmbientStatus?: string;
  chemicalFertiliserClosed?: boolean;
}

const CATEGORY_ORDER: readonly TodayOpportunityCategory[] = ["slurry", "lime", "fertiliser", "soil"];

/**
 * The single source of truth for Today's farm-topic notifications —
 * both the category cards and the priority tracker tile read this same
 * output, never two independently-derived copies (see this module's own
 * header). Sorted most to least urgent (`TODAY_PRIORITY_ORDER`), a
 * stable tie-break on `CATEGORY_ORDER` (Slurry, Lime, Fertiliser, Soil,
 * the brief's own section order) so the card list never reshuffles
 * between renders for an unrelated reason.
 */
export function buildTodayOpportunities(input: BuildTodayOpportunitiesInput): TodayOpportunity[] {
  const opportunities = [
    buildSlurryOpportunity(input.allPrompts, input.fields, input.slurryStorage, input.slurryAmbientStatus),
    buildLimeOpportunity(input.limeRequirement),
    buildFertiliserOpportunity(input.allPrompts, input.fields, input.chemicalFertiliserAmbientStatus, input.chemicalFertiliserClosed),
    buildSoilOpportunity(input.allPrompts, input.fields),
  ].filter((o): o is TodayOpportunity => o !== undefined);

  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2, VERY_LOW: 3 } as const;
  return opportunities.sort((a, b) => {
    const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (rankDiff !== 0) return rankDiff;
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  });
}

// Today Map Priority Semantics Correction (2026-09-19): an earlier
// version of this module exported `computeFieldPriorities`, which
// inherited a farm-topic opportunity's own priority onto every one of
// its affected fields for the map's per-field marker colour. Removed —
// "how important is this category for the farm today?" (a real,
// evidenced farm-level judgement) is not the same question as "which
// specific field should be dealt with first?" (a genuine field-level
// ranking this app does not compute yet), and colouring individual
// fields HIGH/MEDIUM/LOW purely because their parent opportunity has
// that priority silently claimed the latter without ever having
// computed it. `today/page.tsx`'s own map now renders every field
// marker neutrally until a real, scientifically-backed field-level
// priority model exists — see that file's own doc comment. Farm-level
// `TodayPriority`/`TODAY_PRIORITY_LABEL`/`toneForTodayPriority` remain
// entirely unchanged and canonical for the tracker and opportunity
// cards/sheet, which this correction does not touch.
