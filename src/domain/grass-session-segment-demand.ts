/** Time-interval grazing demand for ONE field from recorded sessions joined
 * with resolved, append-only grass intake evidence (Step 4).
 *
 * Pure and deterministic. No production call sites yet.
 *
 * The window is cut at every evidence-segment boundary and every session
 * start/end (movements, headcount changes recorded as new sessions), so each
 * interval has one constant set of animals and one constant set of evidence.
 * Demand for an interval comes only from the existing source-scoped gates
 * (`gateSucklerAllocation`, `gateDairyMidseasonIntake`); this module never
 * computes intake itself.
 *
 * No double counting:
 *  - a group may be in at most one session at a time on the whole farm;
 *  - a paired cow/calf group contributes only through its pair (atomic unit),
 *    and both halves must be grazing this field for the whole interval;
 *  - every grazing group in the field must be accounted for, otherwise HOLD
 *    (an unmodelled group would understate demand).
 *
 * Result is all-or-nothing for the field window: any grazed interval that
 * cannot be evaluated HOLDS the whole result, so a partial sum can never be
 * mistaken for the field's demand. Intervals without a recorded session are
 * reported as NO_RECORDED_SESSION with no number (UNKNOWN is never zero; a
 * consumer decides explicitly whether unrecorded occupancy is acceptable).
 * A window with no recorded grazing at all returns NO_RECORDED_GRAZING with no
 * number, and `completeness` says whether any part of a READY window was
 * unrecorded. An invalid session anywhere on the farm holds the result
 * (conservative: occupancy elsewhere cannot then be trusted).
 *
 * Every quantity is a PLANNING allocation (`PLANNING_ALLOCATION_ONLY`):
 * kg DM/day from the source table multiplied by interval duration. It is
 * never measured disappearance and must not be compared with, or substituted
 * for, cover-loss measurements without labelling.
 *
 * Evidence freshness is evaluated with the gate's own policy at the END of
 * each interval, using the evidence record's `effectiveFrom` (the date the
 * value was asserted to hold), so evidence that goes stale mid-interval HOLDS.
 */
import { gateDairyMidseasonIntake, gateSucklerAllocation, GRASS_INTAKE_EVIDENCE_GATE_VERSION, type Evidence } from "./grass-intake-evidence-gates";
import { GRASS_EVIDENCE_RESOLUTION_VERSION, type GrassEvidenceResolution, type GrassEvidenceSegment } from "./grass-intake-evidence-resolution";
import type { GrassIntakeLedgerRecord } from "./grass-intake-evidence-ledger";
import { DAIRY_MEAL_DM_FRACTION, DAIRY_MIDSEASON_TABLE_VERSION } from "./teagasc-dairy-midseason-intake";
import type { Field } from "./types";
import type { GrassCoverObservation } from "./grass-management";
import type { GrazingFieldSession } from "./grazing-field-pressure";
import type { LivestockGroup } from "./types";

export const GRASS_SESSION_SEGMENT_DEMAND_VERSION = "grass_session_segment_demand_v1.0.0";
const DAY_MS = 86_400_000;

export interface GrassDemandUnit {
  model: "suckler_pair" | "dairy_midseason";
  groupIds: string[];
  sourceSessionIds: string[];
  evidenceRecordIds: string[];
  coverObservationId?: string;
  kgDmPerDay: number;
  kgDm: number;
  ruleId: string;
  /** Published source citation of the rule (from the calculator). */
  source: string;
  /** Evidence dates the gate evaluated, in gate order. */
  evidenceDates: readonly string[];
  gateVersion: typeof GRASS_INTAKE_EVIDENCE_GATE_VERSION;
  limitations: readonly string[];
}

export type GrassDemandInterval =
  | { from: string; to: string; days: number; status: "NO_RECORDED_SESSION" }
  | { from: string; to: string; days: number; status: "GRAZED"; units: GrassDemandUnit[]; kgDmPerDay: number; kgDm: number };

export type GrassSegmentDemand =
  | {
      status: "READY";
      version: typeof GRASS_SESSION_SEGMENT_DEMAND_VERSION;
      resolutionVersion: typeof GRASS_EVIDENCE_RESOLUTION_VERSION;
      farmId: string; fieldId: string; from: string; to: string;
      quantityBasis: "PLANNING_ALLOCATION_ONLY";
      intervals: GrassDemandInterval[];
      /** PARTIAL_UNRECORDED_OCCUPANCY: some intervals had no recorded session; their demand is UNKNOWN, not zero. */
      completeness: "COMPLETE" | "PARTIAL_UNRECORDED_OCCUPANCY";
      /** Sum over GRAZED intervals only. When PARTIAL, this is NOT the field's window demand. */
      grazedKgDm: number;
      unrecordedDays: number;
    }
  | { status: "NO_RECORDED_GRAZING"; version: typeof GRASS_SESSION_SEGMENT_DEMAND_VERSION; farmId: string; fieldId: string; from: string; to: string }
  | { status: "HELD"; version: typeof GRASS_SESSION_SEGMENT_DEMAND_VERSION; reasons: string[] };

const t = Date.parse;
const lc = (s: string) => s.toLowerCase();
const sessionEnd = (s: GrazingFieldSession) => (s.endedAt === undefined ? Infinity : t(s.endedAt));
const evidence = <T>(value: T, record: GrassIntakeLedgerRecord): Evidence<T> => ({ value, farmId: record.farmId, recordedAt: record.effectiveFrom, source: record.source });

export function calculateGrassSessionSegmentDemand(input: {
  farmId: string;
  fieldId: string;
  from: string;
  to: string;
  resolution: GrassEvidenceResolution;
  /** The farm's current fields; the requested field must be one of them. */
  fields: readonly Pick<Field, "id" | "farmId">[];
  /** All of the farm's sessions (every field), so cross-field overlap is detectable. */
  sessions: readonly GrazingFieldSession[];
  /** Current livestock groups; references are re-validated against these. */
  groups: readonly LivestockGroup[];
  covers: readonly GrassCoverObservation[];
}): GrassSegmentDemand {
  const held = (reasons: string[]): GrassSegmentDemand => ({ status: "HELD", version: GRASS_SESSION_SEGMENT_DEMAND_VERSION, reasons: [...new Set(reasons)].sort() });
  const from = t(input.from), to = t(input.to);
  const fieldId = lc(input.fieldId);
  if (!input.farmId.trim() || !fieldId.trim() || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return held(["invalidScopeOrWindow"]);
  if (input.resolution.status !== "RESOLVED") return held(["evidenceResolutionHeld", ...input.resolution.reasons]);
  const resolution = input.resolution;
  if (resolution.farmId !== input.farmId) return held(["crossFarmResolution"]);
  if (!input.fields.some(f => lc(f.id) === fieldId && f.farmId === input.farmId)) return held(["fieldNotFound"]);
  const segs = resolution.segments;
  if (!segs.length || t(segs[0].from) !== from || t(segs[segs.length - 1].to) !== to || segs.some((s, i) => i > 0 && t(segs[i - 1].to) !== t(s.from))) return held(["resolutionWindowMismatch"]);

  // Validate every session of the farm that touches the window; reject cross-farm input outright.
  const reasons: string[] = [];
  const sessions: GrazingFieldSession[] = [];
  const validSessions: GrazingFieldSession[] = [];
  for (const s of input.sessions) {
    if (s.farmId !== input.farmId) { reasons.push(`crossFarmSession:${s.id}`); continue; }
    const start = t(s.startedAt), end = sessionEnd(s);
    if (!s.id.trim() || !s.source.trim() || !s.livestockGroupId.trim() || !s.fieldId.trim() || !Number.isFinite(start) || Number.isNaN(end) || end <= start || !Number.isInteger(s.headCountSnapshot) || s.headCountSnapshot <= 0) {
      reasons.push(`invalidSession:${s.id}`);
      continue;
    }
    validSessions.push(s);
    if (start < to && end > from) sessions.push(s);
  }
  if (new Set(sessions.map(s => s.id)).size !== sessions.length) reasons.push("duplicateSessionIds");
  // A group in two places (or two sessions) at once would be counted twice.
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i], b = sessions[j];
      if (lc(a.livestockGroupId) === lc(b.livestockGroupId) && t(a.startedAt) < sessionEnd(b) && t(b.startedAt) < sessionEnd(a)) reasons.push(`groupInOverlappingSessions:${lc(a.livestockGroupId)}`);
    }
  }
  if (reasons.length) return held(reasons);

  const fieldSessions = sessions.filter(s => lc(s.fieldId) === fieldId);
  // Unfiltered by window: grazing before the window still decides whether a cover is pre-grazing.
  const allFieldSessions = validSessions.filter(s => lc(s.fieldId) === fieldId);
  const cuts = new Set<number>(segs.flatMap(s => [t(s.from), t(s.to)]));
  for (const s of fieldSessions) {
    if (t(s.startedAt) > from) cuts.add(t(s.startedAt));
    if (sessionEnd(s) < to) cuts.add(sessionEnd(s));
  }
  const points = [...cuts].sort((a, b) => a - b);

  const groupById = new Map(input.groups.map(g => [lc(g.id), g]));
  const intervals: GrassDemandInterval[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i], e = points[i + 1];
    const iv = { from: new Date(s).toISOString(), to: new Date(e).toISOString(), days: (e - s) / DAY_MS };
    const seg = segs.find(x => t(x.from) <= s && t(x.to) >= e)!;
    const present = fieldSessions.filter(x => t(x.startedAt) <= s && sessionEnd(x) >= e);
    if (!present.length) { intervals.push({ ...iv, status: "NO_RECORDED_SESSION" }); continue; }
    const tag = `${iv.from}`;
    const bySession = new Map(present.map(x => [lc(x.livestockGroupId), x]));
    for (const x of present) {
      const g = groupById.get(lc(x.livestockGroupId));
      if (!g || g.farmId !== input.farmId) reasons.push(`groupNotFound:${lc(x.livestockGroupId)}`);
      else if (g.category !== x.livestockCategorySnapshot) reasons.push(`groupCategoryChanged:${lc(x.livestockGroupId)}`);
    }
    const units: GrassDemandUnit[] = [];
    const accounted = new Set<string>();
    for (const pair of seg.pairs) {
      const cow = lc(pair.payload.cowGroupId), calf = lc(pair.payload.calfGroupId);
      const cowS = bySession.get(cow), calfS = bySession.get(calf);
      if (!cowS && !calfS) continue;
      accounted.add(cow); accounted.add(calf);
      if (!cowS || !calfS) { reasons.push(`pairNotTogetherInField:${cow}:${calf}@${tag}`); continue; }
      if (groupById.get(cow)?.category !== "suckler_cow" || groupById.get(calf)?.category !== "calf") { reasons.push(`pairGroupCategoryMismatch:${cow}:${calf}`); continue; }
      const unit = sucklerUnit(input.farmId, iv, seg, pair, cowS, calfS, reasons, tag);
      if (unit) units.push(unit);
    }
    for (const [groupId, x] of bySession) {
      if (accounted.has(groupId)) continue;
      const stage = seg.dairyStage[groupId];
      if (!stage) { reasons.push(`noSourceScopedModelForGroup:${groupId}@${tag}`); continue; }
      if (groupById.get(groupId)?.category !== "dairy_cow") { reasons.push(`dairyStageOnNonDairyGroup:${groupId}`); continue; }
      const unit = dairyUnit(input.farmId, fieldId, iv, seg, groupId, stage, x, allFieldSessions, input.covers, reasons, tag);
      if (unit) units.push(unit);
    }
    const kgDmPerDay = units.reduce((a, u) => a + u.kgDmPerDay, 0);
    intervals.push({ ...iv, status: "GRAZED", units, kgDmPerDay, kgDm: kgDmPerDay * iv.days });
  }
  if (reasons.length) return held(reasons);
  if (!intervals.some(x => x.status === "GRAZED")) {
    return { status: "NO_RECORDED_GRAZING", version: GRASS_SESSION_SEGMENT_DEMAND_VERSION, farmId: input.farmId, fieldId: input.fieldId, from: input.from, to: input.to };
  }
  const unrecordedDays = intervals.reduce((a, x) => a + (x.status === "NO_RECORDED_SESSION" ? x.days : 0), 0);
  return {
    status: "READY", version: GRASS_SESSION_SEGMENT_DEMAND_VERSION, resolutionVersion: GRASS_EVIDENCE_RESOLUTION_VERSION,
    farmId: input.farmId, fieldId: input.fieldId, from: input.from, to: input.to, quantityBasis: "PLANNING_ALLOCATION_ONLY", intervals,
    completeness: unrecordedDays > 0 ? "PARTIAL_UNRECORDED_OCCUPANCY" : "COMPLETE",
    grazedKgDm: intervals.reduce((a, x) => a + (x.status === "GRAZED" ? x.kgDm : 0), 0),
    unrecordedDays,
  };
}

type Iv = { from: string; to: string; days: number };

function sucklerUnit(farmId: string, iv: Iv, seg: GrassEvidenceSegment, pair: GrassEvidenceSegment["pairs"][number], cowS: GrazingFieldSession, calfS: GrazingFieldSession, reasons: string[], tag: string): GrassDemandUnit | null {
  const cow = lc(pair.payload.cowGroupId), calf = lc(pair.payload.calfGroupId);
  const cowH = seg.headCountWeight[cow], calfH = seg.headCountWeight[calf];
  const cowF = seg.feed[cow], calfF = seg.feed[calf];
  if (!cowH || !calfH || !cowF || !calfF) { reasons.push(`missingPairEvidence:${cow}:${calf}@${tag}`); return null; }
  if (cowH.payload.headCount !== cowS.headCountSnapshot || calfH.payload.headCount !== calfS.headCountSnapshot) { reasons.push(`headCountSnapshotMismatch:${cow}:${calf}@${tag}`); return null; }
  // Older of the two feed records dates the combined "no supplementary feed" claim (conservative).
  const feedRec = t(cowF.effectiveFrom) <= t(calfF.effectiveFrom) ? cowF : calfF;
  const gate = gateSucklerAllocation({
    farmId, asOf: iv.to,
    pairLink: evidence({ cowGroupId: cow, calfGroupId: calf, calfNotCountedElsewhere: pair.payload.uniquePairConfirmed === true }, pair),
    cowHeadCount: evidence(cowH.payload.headCount, cowH),
    calfHeadCount: evidence(calfH.payload.headCount, calfH),
    cowAverageWeightKg: evidence(cowH.payload.avgWeightKg, cowH),
    calfAverageWeightKg: evidence(calfH.payload.avgWeightKg, calfH),
    calfStage: evidence(pair.payload.calfStage, pair),
    noSupplementaryFeed: evidence(cowF.payload.feedType === "none" && calfF.payload.feedType === "none", feedRec),
  });
  if (gate.status === "HELD") { reasons.push(...gate.reasons.map(r => `${r}:${cow}:${calf}@${tag}`)); return null; }
  const perDay = gate.calculation.totalKgDmDay;
  return {
    model: "suckler_pair", groupIds: [cow, calf], sourceSessionIds: [cowS.id, calfS.id].sort(),
    evidenceRecordIds: [pair.id, cowH.id, calfH.id, cowF.id, calfF.id].sort(),
    kgDmPerDay: perDay, kgDm: perDay * iv.days, ruleId: gate.calculation.ruleId, source: gate.calculation.source,
    evidenceDates: gate.evidenceDates, gateVersion: gate.gateVersion, limitations: gate.calculation.limitations,
  };
}

function dairyUnit(farmId: string, fieldId: string, iv: Iv, seg: GrassEvidenceSegment, groupId: string, stage: GrassEvidenceSegment["dairyStage"][string], session: GrazingFieldSession, allFieldSessions: readonly GrazingFieldSession[], covers: readonly GrassCoverObservation[], reasons: string[], tag: string): GrassDemandUnit | null {
  const head = seg.headCountWeight[groupId], feed = seg.feed[groupId], basis = seg.coverBasis[fieldId];
  if (!head || !feed || !basis) { reasons.push(`missingDairyEvidence:${groupId}@${tag}`); return null; }
  if (head.payload.headCount !== session.headCountSnapshot) { reasons.push(`headCountSnapshotMismatch:${groupId}@${tag}`); return null; }
  // The source table is grass + meal only. A recorded "none" is a recorded zero of all supplementary feed.
  // A "concentrate" record does not (yet) assert that no forage supplement is fed, so it HOLDS until the
  // ledger contract can express "concentrate only" (BLOCKERS GRASS-S4-FEED). Silage/other are out of scope.
  if (feed.payload.feedType === "concentrate") { reasons.push(`concentrateOnlyNotAsserted:${groupId}@${tag}`); return null; }
  if (feed.payload.feedType !== "none") { reasons.push(`unsupportedFeedForDairyModel:${groupId}@${tag}`); return null; }
  const cover = covers.find(c => lc(c.id) === lc(basis.payload.observationId));
  // Pre-grazing: the measurement must be of this field, on this farm, by a measured method (as the insert
  // trigger requires; re-validated at read), taken no later than the start of the continuous occupancy run
  // that contains this session, with no grazing by ANY group between the measurement and that run.
  let runStart = t(session.startedAt);
  for (let changed = true; changed;) {
    changed = false;
    for (const x of allFieldSessions) if (t(x.startedAt) < runStart && sessionEnd(x) >= runStart) { runStart = t(x.startedAt); changed = true; }
  }
  const observed = cover ? t(cover.observedAt) : NaN;
  if (!cover || cover.farmId !== farmId || lc(cover.fieldId) !== fieldId || !Number.isFinite(observed) || observed > runStart || !cover.source.trim()
    || (cover.method !== "plate_meter" && cover.method !== "cut_and_weigh")
    || allFieldSessions.some(x => t(x.startedAt) < runStart && sessionEnd(x) > observed)) {
    reasons.push(`coverObservationUnverified:${fieldId}@${tag}`);
    return null;
  }
  const gate = gateDairyMidseasonIntake({
    farmId, asOf: iv.to,
    headCount: evidence(head.payload.headCount, head),
    lactationStage: evidence(stage.payload.stage, stage),
    // Cover freshness is dated by the measurement itself, not the basis record.
    preGrazingCover: { value: { kgDmHa: cover.coverKgDmHa, basis: basis.payload.basis }, farmId: cover.farmId, recordedAt: cover.observedAt, source: cover.source },
    // Recorded zero: the DM fraction has no effect at 0 kg; the published meal basis is passed only because the
    // gate's input shape requires one, and this substitution is disclosed in the unit's limitations.
    concentrate: evidence({ kgFreshPerHeadDay: 0, dmFraction: DAIRY_MEAL_DM_FRACTION }, feed),
  });
  if (gate.status === "HELD") { reasons.push(...gate.reasons.map(r => `${r}:${groupId}@${tag}`)); return null; }
  const perDay = gate.calculation.grassKgDmPerHeadDay * session.headCountSnapshot;
  return {
    model: "dairy_midseason", groupIds: [groupId], sourceSessionIds: [session.id],
    evidenceRecordIds: [head.id, stage.id, feed.id, basis.id].sort(), coverObservationId: cover.id,
    kgDmPerDay: perDay, kgDm: perDay * iv.days, ruleId: DAIRY_MIDSEASON_TABLE_VERSION, source: gate.calculation.source,
    evidenceDates: gate.evidenceDates, gateVersion: gate.gateVersion,
    limitations: [
      "Mid-season source-scoped grass allocation only; not measured pasture disappearance.",
      "Recorded no supplementary feed: evaluated at 0 kg meal; the table's 88% meal DM basis is nominal at 0 kg.",
    ],
  };
}
