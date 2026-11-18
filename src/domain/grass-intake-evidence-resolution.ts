/** Temporal resolution of the append-only grass intake evidence ledger.
 *
 * Pure and deterministic. Applies explicit supersession, then slices a window
 * into segments in which every active evidence record is constant. It never
 * fills gaps: a subject with no record in a segment is simply absent (UNKNOWN,
 * never zero), and consumers must fail closed on it. Contradictions (two
 * active records for the same kind+subject overlapping in time, or one group
 * in two overlapping cow/calf pairs) HOLD the whole resolution rather than
 * choosing a winner.
 *
 * A correction replaces the whole span of the record it supersedes; any part
 * of that span it does not cover becomes a gap (UNKNOWN). Two open-ended
 * records for one subject always HOLD, so a change over time is recorded by
 * superseding the old record with an end-dated version plus a new record.
 * References are NOT re-validated here; callers must check group/field
 * category and farm against current data before calculating (fail closed).
 */
import type { GrassIntakeEvidencePayload, GrassIntakeLedgerRecord } from "./grass-intake-evidence-ledger";

export const GRASS_EVIDENCE_RESOLUTION_VERSION = "grass_evidence_resolution_v1.0.0";

type Kind = GrassIntakeEvidencePayload["kind"];
type Of<K extends Kind> = GrassIntakeLedgerRecord & { payload: Extract<GrassIntakeEvidencePayload, { kind: K }> };

export interface GrassEvidenceSegment {
  from: string;
  to: string;
  headCountWeight: Record<string, Of<"group_headcount_weight">>;
  feed: Record<string, Of<"group_feed">>;
  dairyStage: Record<string, Of<"dairy_stage">>;
  coverBasis: Record<string, Of<"cover_basis">>;
  pairs: Of<"cow_calf_pair">[];
  /** Groups whose demand must come only from their pair, never standalone. */
  pairedGroupIds: string[];
}

export type GrassEvidenceResolution =
  | { status: "RESOLVED"; version: typeof GRASS_EVIDENCE_RESOLUTION_VERSION; farmId: string; segments: GrassEvidenceSegment[]; supersededIds: string[] }
  | { status: "HELD"; version: typeof GRASS_EVIDENCE_RESOLUTION_VERSION; reasons: string[] };

/** Must match `grass_intake_evidence_subject` in the evidence migration. */
export function grassEvidenceSubject(payload: GrassIntakeEvidencePayload): string {
  switch (payload.kind) {
    case "cow_calf_pair": return `${payload.cowGroupId.toLowerCase()}:${payload.calfGroupId.toLowerCase()}`;
    case "cover_basis": return payload.fieldId.toLowerCase();
    default: return payload.groupId.toLowerCase();
  }
}

const start = (r: GrassIntakeLedgerRecord) => Date.parse(r.effectiveFrom);
const end = (r: GrassIntakeLedgerRecord) => (r.effectiveTo === undefined ? Infinity : Date.parse(r.effectiveTo));
const overlaps = (a: GrassIntakeLedgerRecord, b: GrassIntakeLedgerRecord) => start(a) < end(b) && start(b) < end(a);

export function resolveGrassIntakeEvidence(input: {
  farmId: string;
  from: string;
  to: string;
  records: readonly GrassIntakeLedgerRecord[];
}): GrassEvidenceResolution {
  const held = (reasons: string[]): GrassEvidenceResolution => ({ status: "HELD", version: GRASS_EVIDENCE_RESOLUTION_VERSION, reasons: [...new Set(reasons)].sort() });
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);
  if (!input.farmId.trim() || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return held(["invalidScopeOrWindow"]);

  const reasons: string[] = [];
  const byId = new Map<string, GrassIntakeLedgerRecord>();
  for (const r of input.records) {
    if (r.farmId !== input.farmId) reasons.push(`crossFarmRecord:${r.id}`);
    if (byId.has(r.id)) reasons.push(`duplicateRecordId:${r.id}`);
    byId.set(r.id, r);
  }
  const superseded = new Set<string>();
  for (const r of input.records) {
    if (r.supersedesId === undefined) continue;
    const prior = byId.get(r.supersedesId);
    if (!prior) { reasons.push(`missingSupersededRecord:${r.id}`); continue; }
    if (prior.payload.kind !== r.payload.kind || grassEvidenceSubject(prior.payload) !== grassEvidenceSubject(r.payload)) reasons.push(`invalidSupersession:${r.id}`);
    if (Date.parse(prior.recordedAt) > Date.parse(r.recordedAt)) reasons.push(`supersessionRecordedBeforeTarget:${r.id}`);
    if (superseded.has(prior.id)) reasons.push(`forkedSupersession:${prior.id}`);
    superseded.add(prior.id);
  }
  // Defensive: the database cannot create a cycle, but other inputs could.
  for (const r of input.records) {
    let cursor = r.supersedesId === undefined ? undefined : byId.get(r.supersedesId);
    for (let steps = 0; cursor && steps <= input.records.length; steps++) {
      if (cursor.id === r.id) { reasons.push(`supersessionCycle:${r.id}`); break; }
      cursor = cursor.supersedesId === undefined ? undefined : byId.get(cursor.supersedesId);
    }
  }
  if (reasons.length) return held(reasons);

  const active = input.records.filter(r => !superseded.has(r.id) && start(r) < to && end(r) > from);
  // Same kind+subject must never overlap: no silent winner.
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (a.payload.kind === b.payload.kind && grassEvidenceSubject(a.payload) === grassEvidenceSubject(b.payload) && overlaps(a, b)) {
        reasons.push(`overlappingEvidence:${a.payload.kind}:${grassEvidenceSubject(a.payload)}`);
      }
      if (a.payload.kind === "cow_calf_pair" && b.payload.kind === "cow_calf_pair" && overlaps(a, b)) {
        const ga = [a.payload.cowGroupId, a.payload.calfGroupId].map(s => s.toLowerCase());
        const gb = [b.payload.cowGroupId, b.payload.calfGroupId].map(s => s.toLowerCase());
        for (const g of ga) if (gb.includes(g)) reasons.push(`groupInMultiplePairs:${g}`);
      }
    }
  }
  if (reasons.length) return held(reasons);

  const cuts = new Set<number>([from, to]);
  for (const r of active) {
    if (start(r) > from) cuts.add(start(r));
    if (end(r) < to) cuts.add(end(r));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: GrassEvidenceSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i], e = points[i + 1];
    const seg: GrassEvidenceSegment = { from: new Date(s).toISOString(), to: new Date(e).toISOString(), headCountWeight: {}, feed: {}, dairyStage: {}, coverBasis: {}, pairs: [], pairedGroupIds: [] };
    for (const r of active) {
      if (!(start(r) <= s && end(r) >= e)) continue;
      const p = r.payload;
      const key = grassEvidenceSubject(p);
      if (p.kind === "group_headcount_weight") seg.headCountWeight[key] = r as Of<"group_headcount_weight">;
      else if (p.kind === "group_feed") seg.feed[key] = r as Of<"group_feed">;
      else if (p.kind === "dairy_stage") seg.dairyStage[key] = r as Of<"dairy_stage">;
      else if (p.kind === "cover_basis") seg.coverBasis[key] = r as Of<"cover_basis">;
      else {
        seg.pairs.push(r as Of<"cow_calf_pair">);
        seg.pairedGroupIds.push(p.cowGroupId.toLowerCase(), p.calfGroupId.toLowerCase());
      }
    }
    seg.pairs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    seg.pairedGroupIds.sort();
    segments.push(seg);
  }
  return { status: "RESOLVED", version: GRASS_EVIDENCE_RESOLUTION_VERSION, farmId: input.farmId, segments, supersededIds: [...superseded].sort() };
}
