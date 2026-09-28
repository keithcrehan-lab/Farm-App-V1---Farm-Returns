/**
 * Campaign B — slurry-origin evidence: where the slurry in ONE planned
 * spreading (a `slurry_allocations` row) came from, as the farmer (or
 * another authoritative source) explicitly declared it
 * (`slurry_allocation_origin_evidence_records`,
 * `supabase/migrations/20260928000000_slurry_allocation_origin_evidence.sql`).
 *
 * Subject: the planned allocation at one plan revision — never the store.
 * A store can hold home-produced and imported slurry at once, and imported
 * slurry added to a tank later would make a permanent store-level answer
 * false without anyone editing it. The declaration describes the material
 * a specific plan draws; the database stamps the plan revision, field,
 * store and planned volume it was made against, and it applies only while
 * the allocation is still at that revision (`plan_revision` is bumped by
 * the database whenever the field, store or planned volume is edited). An
 * edited or moved plan therefore needs a fresh declaration; a recreated
 * plan is a new allocation with none. Completed and cancelled plans keep
 * their declarations untouched (append-only; no new declaration can be
 * made once a plan leaves `planned`).
 *
 * Origin is NEVER inferred — not from store ownership or location, cattle
 * on the holding, housing records, the allocation source, composition,
 * volume or history. No record = not established. "Mixed" and "not sure"
 * are recorded answers, but neither is an origin the regulatory engine can
 * use: no quantity split is held, and none is invented, so both keep the
 * NAP check blocked. Several contributing plans for one field with
 * different known origins are mixed material too: `calculateNutrientPlan`
 * accepts one origin per field and no audited contract splits it, so that
 * stays blocked as well.
 *
 * Storage discipline is `regulatory-evidence-records.ts`'s: append-only,
 * a correction is a new record, the current applicable record is derived
 * on read (latest capture time; contradictory records tied on capture time
 * become a conflict, equivalent ones collapse by record id).
 */
import type { DataStatus } from "./types";
import type { EvidenceFact, EvidenceSourceRef } from "./slurry-evidence-context";
import type { RegulatoryManureOrigin } from "./nutrients";
import { isActiveReservation, type SlurryAllocationRecord } from "./slurry-allocation-lifecycle";

export const SLURRY_ORIGIN_EVIDENCE_VERSION = "slurry_origin_evidence_v1.0.0";

/** What the declaration says about the planned slurry. */
export const SLURRY_ORIGIN_DECLARATIONS = ["home_produced_grazing_livestock", "imported_organic_manure", "mixed", "unknown"] as const;
export type SlurryOriginDeclaration = (typeof SLURRY_ORIGIN_DECLARATIONS)[number];

/** No engine estimates origin, so a record is only ever the farmer's own
 * declaration or verified evidence. */
export const SLURRY_ORIGIN_EVIDENCE_STATUSES = ["farmer_adjusted", "verified"] as const;
export type SlurryOriginEvidenceStatus = Extract<DataStatus, (typeof SLURRY_ORIGIN_EVIDENCE_STATUSES)[number]>;

export interface SlurryOriginEvidenceRecord {
  id: string;
  farmId: string;
  allocationId: string;
  origin: SlurryOriginDeclaration;
  status: SlurryOriginEvidenceStatus;
  source: string;
  note?: string;
  /** The allocation state the declaration was made against — stamped by
   * the database from the allocation row, never by the client. */
  planRevisionAtRecord: number;
  fieldIdAtRecord: string;
  housingIdAtRecord: string;
  volumeM3AtRecord: number;
  /** Database capture time (`created_at`, `clock_timestamp()`). */
  recordedAt: string;
  /** Authenticated user who captured it (`created_by`, database-stamped). */
  recordedBy?: string;
}

export interface NewSlurryOriginEvidenceInput {
  allocationId: string;
  /** The plan revision the farmer was looking at; the database refuses the
   * record if the plan has changed since. */
  planRevision: number;
  origin: SlurryOriginDeclaration;
  status: SlurryOriginEvidenceStatus;
  source: string;
  note?: string;
}

export type SlurryOriginEvidenceIssue = "ALLOCATION_NOT_FOUND" | "PLAN_REVISION_INVALID" | "ORIGIN_INVALID" | "STATUS_INVALID" | "SOURCE_REQUIRED";

export function validateNewSlurryOriginEvidenceInput(input: NewSlurryOriginEvidenceInput): SlurryOriginEvidenceIssue[] {
  const issues: SlurryOriginEvidenceIssue[] = [];
  if (typeof input.allocationId !== "string" || input.allocationId.trim() === "") issues.push("ALLOCATION_NOT_FOUND");
  if (typeof input.planRevision !== "number" || !Number.isInteger(input.planRevision) || input.planRevision < 1) issues.push("PLAN_REVISION_INVALID");
  if (!(SLURRY_ORIGIN_DECLARATIONS as readonly string[]).includes(input.origin)) issues.push("ORIGIN_INVALID");
  if (!(SLURRY_ORIGIN_EVIDENCE_STATUSES as readonly string[]).includes(input.status)) issues.push("STATUS_INVALID");
  if (typeof input.source !== "string" || input.source.trim() === "") issues.push("SOURCE_REQUIRED");
  return issues;
}

// ---------------------------------------------------------------------------
// Current applicable record per allocation
// ---------------------------------------------------------------------------

export type CurrentSlurryOriginEvidence = { record: SlurryOriginEvidenceRecord } | { tied: readonly SlurryOriginEvidenceRecord[] };

/** Whether a declaration still describes the allocation as it stands: the
 * same plan revision AND the same field, store and planned volume. An
 * allocation with no known revision (the revision column is not applied)
 * cannot be matched to any declaration. */
export function originEvidenceAppliesTo(
  record: SlurryOriginEvidenceRecord,
  allocation: Pick<SlurryAllocationRecord, "id" | "planRevision" | "fieldId" | "housingId" | "volumeM3">,
): boolean {
  return (
    record.allocationId === allocation.id &&
    allocation.planRevision !== undefined &&
    record.planRevisionAtRecord === allocation.planRevision &&
    record.fieldIdAtRecord === allocation.fieldId &&
    record.housingIdAtRecord === allocation.housingId &&
    record.volumeM3AtRecord === allocation.volumeM3
  );
}

/** Origin, status and source are material: tied records differing in any
 * of them are never collapsed. */
function equivalentOrigin(a: SlurryOriginEvidenceRecord, b: SlurryOriginEvidenceRecord): boolean {
  return a.origin === b.origin && a.status === b.status && a.source === b.source;
}

/**
 * The current declaration for one allocation among those that still apply
 * to it: latest capture time. Declarations for an earlier revision of the
 * plan are kept on record but never selected. Undefined = not established.
 */
export function currentSlurryOriginEvidence(
  allocation: Pick<SlurryAllocationRecord, "id" | "planRevision" | "fieldId" | "housingId" | "volumeM3">,
  records: readonly SlurryOriginEvidenceRecord[],
): CurrentSlurryOriginEvidence | undefined {
  let latest: SlurryOriginEvidenceRecord[] = [];
  for (const r of records) {
    if (!originEvidenceAppliesTo(r, allocation)) continue;
    if (latest.length === 0 || r.recordedAt > latest[0].recordedAt) latest = [r];
    else if (r.recordedAt === latest[0].recordedAt) latest.push(r);
  }
  if (latest.length === 0) return undefined;
  const byId = [...latest].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return byId.every((r) => equivalentOrigin(r, byId[0])) ? { record: byId[0] } : { tied: byId };
}

/** Every declaration made for an allocation, newest first — history for
 * review, including ones that no longer apply. */
export function slurryOriginEvidenceHistory(allocationId: string, records: readonly SlurryOriginEvidenceRecord[]): SlurryOriginEvidenceRecord[] {
  return records
    .filter((r) => r.allocationId === allocationId)
    .sort((a, b) => (a.recordedAt !== b.recordedAt ? (a.recordedAt < b.recordedAt ? 1 : -1) : a.id < b.id ? -1 : 1));
}

// ---------------------------------------------------------------------------
// The field's planned-manure origin for the regulatory engine
// ---------------------------------------------------------------------------

/** Why a field's planned-manure origin is unresolved, least usable first. */
const UNRESOLVED_ORIGIN_REASON_RANK: readonly string[] = [
  "PLANNED_MANURE_ORIGIN_TIED_DECLARATIONS_CONFLICT",
  "PLANNED_MANURE_ORIGIN_MIXED_SPLIT_NOT_ESTABLISHED",
  "PLANNED_MANURE_ORIGINS_DIFFER_ACROSS_PLANS",
  "PLANNED_MANURE_ORIGIN_DECLARED_UNKNOWN",
  "PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED",
];

function unresolvedRank(reasonCode: string): number {
  const i = UNRESOLVED_ORIGIN_REASON_RANK.indexOf(reasonCode);
  return i < 0 ? 0 : i;
}

const ORIGIN_TRUST_RANK: Record<SlurryOriginEvidenceStatus, number> = { verified: 0, farmer_adjusted: 1 };

const REGULATORY_ORIGIN: Partial<Record<SlurryOriginDeclaration, RegulatoryManureOrigin>> = {
  home_produced_grazing_livestock: "home_produced_grazing_livestock",
  imported_organic_manure: "imported",
};

/** One plan's declaration behind a known field-level origin. */
export type PlannedManureOriginContribution = { allocationId: string } & Required<Pick<EvidenceSourceRef, "recordId" | "recordedAt">> & EvidenceSourceRef;

/** A field's planned-manure origin; when known from several plans, each
 * contributing declaration's own provenance is listed (the aggregate
 * status/source alone cannot trace an exclusion to its records). */
export type PlannedManureOriginFact = EvidenceFact<RegulatoryManureOrigin> & { contributingDeclarations?: readonly PlannedManureOriginContribution[] };

/**
 * The origin of the slurry planned for a field, in the form
 * `calculateNutrientPlan` reads. The planned set is exactly the one
 * `fieldPlannedRegulatoryNeatSlurry` sums (active, not `not_suitable`).
 * Known only when EVERY contributing plan has a current applicable
 * declaration of the same usable origin; anything else stays missing or
 * conflicting — never a guessed or majority origin.
 */
export function fieldPlannedManureOrigin(
  allocationRecords: readonly SlurryAllocationRecord[],
  fieldId: string,
  originRecords: readonly SlurryOriginEvidenceRecord[],
): PlannedManureOriginFact {
  const planned = allocationRecords.filter((r) => isActiveReservation(r) && r.fieldId === fieldId && r.priority !== "not_suitable");
  if (planned.length === 0) return { state: "missing", reasonCode: "NO_PLANNED_SLURRY" };
  const reasons: string[] = [];
  const known: { origin: RegulatoryManureOrigin; record: SlurryOriginEvidenceRecord }[] = [];
  for (const allocation of [...planned].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const current = currentSlurryOriginEvidence(allocation, originRecords);
    if (current === undefined) {
      reasons.push("PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED");
    } else if ("tied" in current) {
      reasons.push("PLANNED_MANURE_ORIGIN_TIED_DECLARATIONS_CONFLICT");
    } else if (current.record.origin === "mixed") {
      reasons.push("PLANNED_MANURE_ORIGIN_MIXED_SPLIT_NOT_ESTABLISHED");
    } else if (current.record.origin === "unknown") {
      reasons.push("PLANNED_MANURE_ORIGIN_DECLARED_UNKNOWN");
    } else {
      const origin = REGULATORY_ORIGIN[current.record.origin];
      if (origin === undefined) reasons.push("PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED");
      else known.push({ origin, record: current.record });
    }
  }
  if (known.length > 1 && new Set(known.map((k) => k.origin)).size > 1) reasons.push("PLANNED_MANURE_ORIGINS_DIFFER_ACROSS_PLANS");
  if (reasons.length > 0) {
    const worst = reasons.reduce((w, r) => (unresolvedRank(r) < unresolvedRank(w) ? r : w));
    // A conflict carries no candidate values: no field-level origin is derived.
    return worst === "PLANNED_MANURE_ORIGIN_TIED_DECLARATIONS_CONFLICT" ? { state: "conflicting", reasonCode: worst, candidates: [] } : { state: "missing", reasonCode: worst };
  }
  const status = known.map((k) => k.record.status).reduce((weakest, s) => (ORIGIN_TRUST_RANK[s] > ORIGIN_TRUST_RANK[weakest] ? s : weakest));
  const ref: EvidenceSourceRef = {
    status,
    source: known.map((k) => k.record.source).join("; "),
    ...(known.length === 1 ? { recordedAt: known[0].record.recordedAt, recordId: known[0].record.id } : {}),
  };
  if (known.length === 1) return { state: "known", value: known[0].origin, ...ref, freshness: "NO_FRESHNESS_POLICY" };
  const contributingDeclarations = known.map(({ record: r }) => ({ allocationId: r.allocationId, status: r.status, source: r.source, recordedAt: r.recordedAt, recordId: r.id }));
  return { state: "known", value: known[0].origin, ...ref, freshness: "NO_FRESHNESS_POLICY", contributingDeclarations };
}

// ---------------------------------------------------------------------------
// Farmer-facing wording (no internal enum or reason code is ever shown)
// ---------------------------------------------------------------------------

export const SLURRY_ORIGIN_QUESTION = {
  prompt: "Where did the slurry for this spreading come from?",
  options: [
    { value: "home_produced_grazing_livestock", label: "Produced on this farm by my own grazing stock (cattle, sheep, goats, deer or horses)" },
    { value: "imported_organic_manure", label: "Brought in from another farm" },
    { value: "mixed", label: "A mix of both" },
    { value: "unknown", label: "Not sure" },
  ],
} as const satisfies { prompt: string; options: readonly { value: SlurryOriginDeclaration; label: string }[] };

export const SLURRY_ORIGIN_SUMMARY_LABEL: Record<SlurryOriginDeclaration, string> = {
  home_produced_grazing_livestock: "Produced on this farm by your own grazing stock",
  imported_organic_manure: "Brought in from another farm",
  mixed: "A mix of your own and brought-in slurry",
  unknown: "Not sure",
};

/** Plain-English note shown beside a declaration the nitrates check cannot
 * use; undefined when the declaration is usable. */
export function slurryOriginDeclarationNote(origin: SlurryOriginDeclaration): string | undefined {
  if (origin === "mixed") return "Farm Return can't split mixed slurry between your own and brought-in, so the nitrates N/P check for this field stays unavailable.";
  if (origin === "unknown") return "Until you know where it came from, the nitrates N/P check for this field stays unavailable.";
  return undefined;
}

/** Refusals the database adds to the shape checks above. */
export type SlurryOriginEvidenceRejection = SlurryOriginEvidenceIssue | "PLAN_CHANGED" | "NOT_PLANNED" | "NOT_AVAILABLE";

export const SLURRY_ORIGIN_ISSUE_COPY: Record<SlurryOriginEvidenceRejection, string> = {
  ALLOCATION_NOT_FOUND: "This spreading plan could not be found. Refresh the plan and try again.",
  PLAN_REVISION_INVALID: "This spreading plan has changed. Refresh the plan and try again.",
  PLAN_CHANGED: "This spreading plan has changed since you opened it. Refresh the plan and answer again.",
  NOT_PLANNED: "This plan has already been spread or cancelled, so where its slurry came from can no longer be changed.",
  ORIGIN_INVALID: "Choose where the slurry came from.",
  STATUS_INVALID: "Choose where the slurry came from.",
  SOURCE_REQUIRED: "Choose where the slurry came from.",
  NOT_AVAILABLE: "Recording where slurry came from isn't available yet. Nothing was saved.",
};
