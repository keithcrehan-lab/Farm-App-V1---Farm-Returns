/**
 * Cattle C10 — work (Plan jobs) for one animal, as the frozen Plan kernel and
 * C9 left it. C10 never ranks, re-times or completes work: order is the Plan
 * kernel's `compareSystemPriority` (tier) then the job's own id; status,
 * readiness and completion are the kernel's; windows, hard deadlines and
 * blockers are C9's. A recommended window is never shown as a deadline;
 * "Must be done by" appears only for a C9 `hardDeadline`.
 */

import type { RecommendationRecord } from "../recommendations";
import type { CattlePlanProposalGroup, CattlePlanWorkItem } from "../plan-interface";
import { compareSystemPriority, planJobIdentityKey, type PlanJob } from "../../plan";
import type { CattleDirectory, CattleOutputs, CattlePlanJobState } from "./cattle-outputs";
import {
  ACTION_COPY,
  BLOCKER_DISPLAY,
  LIMITATION_COPY,
  COMPLETION_DISPLAY,
  JOB_STATUS_DISPLAY,
  OBLIGATION_DISPLAY,
  PRIORITY_DISPLAY,
  PROGRAMME_DISPLAY,
  READINESS_DISPLAY,
  displayOf,
  reasonSentence,
  type DisplayState,
} from "./display-states";
import { formatDate, formatDayMonth } from "./format";

export interface WhySource {
  label: string;
  detail: string;
}

/** Progressive "Why?" disclosure: primary → why it matters → evidence → technical. */
export interface WhyVM {
  /** One sentence: why this matters. */
  summary: string;
  /** Where the work comes from (programme, requirement, record gap, suggestion). */
  origins: string[];
  /** Plain explanation lines from the owning engine's evidence (C8 explanation, C9 window basis, completion rule). */
  evidence: string[];
  assumptions: string[];
  limitations: string[];
  unknowns: string[];
  sources: WhySource[];
  /** How the work gets marked done. */
  completionRule: string;
  /** Technical provenance (shown only on request). */
  technical: { label: string; value: string }[];
}

export interface WorkBlockerVM {
  state: DisplayState;
  /** Farmer sentence. */
  text: string;
}

export interface WorkVM {
  jobId: string;
  actionKind: string | null;
  title: string;
  shortTitle: string;
  priority: DisplayState;
  status: DisplayState;
  readiness: DisplayState;
  completion: DisplayState;
  open: boolean;
  /** Recommended (never legal) window. */
  window: { label: string; opensAt: string | null; dueAt: string | null } | null;
  /** Only when C9 sourced a hard deadline. */
  hardDeadline: { label: string; dueAt: string } | null;
  blockers: WorkBlockerVM[];
  /** When the kernel completed it, and on what basis. */
  completed: { at: string; label: string } | null;
  why: WhyVM;
}

const ORIGIN_LABEL: Readonly<Record<string, string>> = {
  OBLIGATION: "Requirement",
  PROGRAMME: "Veterinary programme",
  DATA_GAP: "Gap in your records",
  RECOMMENDATION: "Suggestion",
};

const isAnimalJob = (job: PlanJob, animalId: string) => job.scope.kind === "STATIC" && job.scope.members.some((m) => m.id === animalId);

function actionKindOf(job: PlanJob): string | null {
  const m = /^CATTLE_RECOMMENDATION:(.+)$/.exec(job.actionKey);
  return m ? m[1] : null;
}

function labelled(map: Readonly<Record<string, string>>, ref: string, fallback: string): string {
  return Object.hasOwn(map, ref) ? map[ref] : fallback;
}

function titleOf(job: PlanJob, directory: CattleDirectory): { title: string; short: string; why: string } {
  const kind = actionKindOf(job);
  if (kind !== null) return ACTION_COPY[kind] ?? { title: "Suggested action", short: "Suggested", why: "Suggested from your records." };
  const obligation = /^CATTLE_OBLIGATION:(.+)$/.exec(job.actionKey);
  if (obligation) {
    const name = labelled(directory.obligationLabels, obligation[1], "Unnamed requirement");
    return { title: name, short: "Requirement", why: "A recorded requirement applies to this animal and has no proof of completion yet." };
  }
  const programme = /^CATTLE_PROGRAMME:(.+)$/.exec(job.actionKey);
  if (programme) {
    let name = "Unnamed programme";
    try {
      const [programmeId] = JSON.parse(programme[1]) as [string, string];
      name = labelled(directory.programmeLabels, programmeId, name);
    } catch {
      /* fall through: shown as unnamed, never guessed */
    }
    return { title: name, short: "Programme", why: "A treatment in the declared veterinary programme falls in this window." };
  }
  return { title: "Cattle work", short: "Work", why: "Raised from your cattle records." };
}

function blockerText(item: CattlePlanWorkItem | undefined, status: string): string {
  if (status === "UNKNOWN") return "Waiting on information: a required record is missing or unclear, so this can't be confirmed yet.";
  if (status === "ACTIVE") {
    const legal = item?.blockers.some((b) => b.kind === "LEGAL_WINDOW");
    return legal ? "A medicine withdrawal is in force for this animal (an engine check, not a legal ruling)." : "A required check failed, so this can't go ahead yet.";
  }
  return "Cleared.";
}

function completionRule(job: PlanJob): string {
  const c = job.completionContract;
  if (c.kind === "MANUAL") return "No record can prove this one, so you mark it done yourself.";
  if (c.kind === "DATA_COMPLETION") return "Done automatically when a production goal is recorded for the animal.";
  if (c.kind === "OPERATIONAL_RECORD" && /^CATTLE_WEIGHT_OBSERVATION:/.test(c.recordKind)) {
    return `Done automatically by a weight taken on or after ${formatDate(c.notBeforeIso ?? job.createdAt)}. An earlier, back-dated weight doesn't close it.`;
  }
  return "Done automatically when the treatment or proof is recorded.";
}

function windowOf(job: PlanJob): WorkVM["window"] {
  const w = job.timing.recommendedWindow;
  if (w === null) return null;
  const from = w.startIso === null ? null : formatDayMonth(w.startIso);
  // C9 windows are [opens, due): the last day inside is the day before `due`.
  const to = w.endIso === null ? null : formatDayMonth(w.endIso);
  const label = from && to ? `Recommended window ${from} – before ${to}` : to ? `Recommended before ${to}` : from ? `Recommended from ${from}` : "Recommended window";
  return { label, opensAt: w.startIso, dueAt: w.endIso };
}

function whyOf(job: PlanJob, group: CattlePlanProposalGroup | undefined, record: RecommendationRecord | null, recordUnavailable: boolean, base: { why: string }, directory: CattleDirectory): WhyVM {
  const items = group?.items ?? [];
  const origins = [...new Set([...(group?.origins ?? []), ...items.flatMap((i) => i.supporting.map((s) => s.origin))])].map((o) => ORIGIN_LABEL[o] ?? o);
  const evidence: string[] = [];
  for (const i of items) {
    if (i.family === "C2_OBLIGATION") evidence.push(`Requirement: ${displayOf(OBLIGATION_DISPLAY, i.consumedState, "OBLIGATION").label.toLowerCase()}.`);
    if (i.family === "C7_PROGRAMME") evidence.push(`Programme treatment: ${displayOf(PROGRAMME_DISPLAY, i.consumedState, "PROGRAMME").label.toLowerCase()}.`);
    for (const code of [...i.reasonCodes, ...i.supporting.flatMap((x) => x.reasonCodes)]) {
      const sentence = reasonSentence(code);
      if (sentence) evidence.push(sentence);
    }
    if (i.timing.window !== null) evidence.push("The window is a recommendation from the programme or requirement, not a legal deadline unless one is shown.");
  }
  const sources: WhySource[] = [];
  for (const i of items) {
    for (const s of i.timing.sourceChecks) sources.push({ label: s.bound.sourceId, detail: `version ${s.bound.version} · ${s.status.toLowerCase().replace(/_/g, " ")}` });
    if (i.timing.hardDeadline) sources.push({ label: i.timing.hardDeadline.authority.sourceId, detail: `deadline authority, version ${i.timing.hardDeadline.authority.version}` });
  }
  for (const s of record?.sourceRefs ?? []) sources.push({ label: s.sourceId, detail: `version ${s.version}` });
  const technical: WhyVM["technical"] = [
    { label: "Plan job", value: job.id },
    { label: "Action key", value: job.actionKey },
    { label: "Priority basis", value: job.systemPriority.basis },
    ...items.map((i) => ({ label: `Source output (${i.family})`, value: `${i.outputId} · ${i.outputFingerprint.digest.slice(0, 12)}…` })),
    ...items.flatMap((i) => (i.reasonCodes.length ? [{ label: "Reason codes", value: i.reasonCodes.join(", ") }] : [])),
  ];
  if (record) {
    technical.push({ label: "Evidence pack", value: `${record.packId} · ${record.packFingerprint.digest.slice(0, 12)}…` });
    technical.push({ label: "Evidence", value: `${record.evidence.type} · ${record.evidence.strength} · priority ${record.evidence.priorityBasis}` });
    technical.push({ label: "Engine explanation", value: record.explanation });
    for (const l of record.limitations.filter((x) => !Object.hasOwn(LIMITATION_COPY, x))) technical.push({ label: "Limitation", value: l });
    for (const u of record.unknowns) technical.push({ label: "Unknown", value: u });
  }
  void directory;
  return {
    summary: base.why,
    origins,
    evidence: [...new Set(evidence)],
    assumptions: record?.assumptions ?? [],
    limitations: (record?.limitations ?? []).filter((x) => Object.hasOwn(LIMITATION_COPY, x)).map((x) => LIMITATION_COPY[x]),
    unknowns: [
      ...(record && record.expectedOutcome?.effect.state !== "EFFECT_SUPPORTED" ? ["No model estimates what this changes in weight or money."] : []),
      // The C8 record behind a recommendation job couldn't be read: its evidence is unknown, not absent.
      ...(recordUnavailable ? ["The recommendation record couldn't be read, so its evidence and assumptions aren't shown."] : []),
    ],
    sources,
    completionRule: completionRule(job),
    technical,
  };
}

function groupOf(outputs: CattleOutputs, job: PlanJob): CattlePlanProposalGroup | undefined {
  if (!outputs.plan.ok) return undefined;
  const key = planJobIdentityKey(job);
  return outputs.plan.result.groups.find((g) => g.identityKey === key);
}

function recordOf(outputs: CattleOutputs, animalId: string, job: PlanJob): RecommendationRecord | null {
  const kind = actionKindOf(job);
  if (kind === null || !outputs.recommendations.ok) return null;
  const rec = outputs.recommendations.result.animals.find((a) => a.animalId === animalId)?.record ?? null;
  return rec && rec.recommendedAction?.actionKind === kind ? rec : null;
}

export function workVM(state: CattlePlanJobState, outputs: CattleOutputs, animalId: string, directory: CattleDirectory): WorkVM {
  const job = state.job;
  const group = groupOf(outputs, job);
  const copy = titleOf(job, directory);
  const blockers: WorkBlockerVM[] = [];
  const blockerById = outputs.plan.ok ? Object.fromEntries(outputs.plan.result.blockers.map((b) => [b.id, b])) : {};
  for (const id of job.dependencies.blockerIds) {
    const b = blockerById[id];
    const status = b?.status ?? "UNKNOWN";
    if (status === "CLEARED") continue;
    const item = group?.items.find((i) => i.blockers.some((x) => x.id === id));
    blockers.push({ state: displayOf(BLOCKER_DISPLAY, status, "BLOCKER"), text: blockerText(item, status) });
  }
  const open = !["COMPLETED", "OBSOLETE", "CANCELLED"].includes(job.status);
  const hd = job.timing.hardDeadline;
  return {
    jobId: job.id,
    actionKind: actionKindOf(job),
    title: copy.title,
    shortTitle: copy.short,
    priority: displayOf(PRIORITY_DISPLAY, job.systemPriority.tier, "PRIORITY"),
    status: displayOf(JOB_STATUS_DISPLAY, job.status, "JOB"),
    readiness: displayOf(READINESS_DISPLAY, state.evaluation?.readiness.state ?? "NOT_EVALUATED", "READINESS"),
    completion: displayOf(COMPLETION_DISPLAY, state.evaluation?.completion.state ?? "NOT_EVALUATED", "COMPLETION"),
    open,
    window: windowOf(job),
    hardDeadline: hd === null ? null : { label: `Must be done by ${formatDate(hd.dueIso)}`, dueAt: hd.dueIso },
    blockers,
    completed:
      job.completion === null
        ? null
        : { at: job.completion.at, label: job.completion.basis === "CANONICAL_EVIDENCE" ? "Closed by your records" : job.completion.basis === "FARMER_OVERRIDE" ? "Marked done (override)" : "Marked done" },
    why: whyOf(job, group, recordOf(outputs, animalId, job), actionKindOf(job) !== null && !outputs.recommendations.ok, copy, directory),
  };
}

/** The animal's work: open jobs in Plan-kernel priority order, then closed jobs (most recent first). */
export function animalWork(outputs: CattleOutputs, animalId: string, directory: CattleDirectory): { open: WorkVM[]; closed: WorkVM[] } {
  const states = outputs.jobs.filter((s) => isAnimalJob(s.job, animalId));
  const openStates = states
    .filter((s) => !["COMPLETED", "OBSOLETE", "CANCELLED"].includes(s.job.status))
    .sort((a, b) => compareSystemPriority(a.job.systemPriority, b.job.systemPriority) || (a.job.id < b.job.id ? -1 : 1));
  const closedStates = states.filter((s) => ["COMPLETED", "OBSOLETE", "CANCELLED"].includes(s.job.status)).sort((a, b) => ((b.job.completion?.at ?? "") < (a.job.completion?.at ?? "") ? -1 : 1));
  return { open: openStates.map((s) => workVM(s, outputs, animalId, directory)), closed: closedStates.map((s) => workVM(s, outputs, animalId, directory)) };
}
