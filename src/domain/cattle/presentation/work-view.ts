/**
 * Cattle C10 — work (Plan jobs) for one animal, as the frozen Plan kernel and
 * C9 left it. C10 never ranks, re-times or completes work: order is the Plan
 * kernel's `compareSystemPriority` (tier) then the job's own id; status,
 * readiness and completion are the kernel's; windows, hard deadlines and
 * blockers are C9's. A recommended window is never shown as a deadline;
 * "Must be done before" appears only for a C9 `hardDeadline` (sourced authority);
 * like the window, its `dueIso` is exclusive — the Plan kernel counts any
 * time after it as late — so it is "before {due}", never "by {due}".
 */

import type { CattlePlanProposalGroup } from "../plan-interface";
import { compareSystemPriority, planJobIdentityKey, type PlanJob } from "../../plan";
import type { CattleDirectory, CattleOutputs, CattlePlanJobState } from "./cattle-outputs";
import {
  ACTION_COPY,
  BLOCKER_DISPLAY,
  BLOCKERS_MIXED_DISPLAY,
  LIMITATION_COPY,
  COMPLETION_DISPLAY,
  JOB_STATUS_DISPLAY,
  OBLIGATION_DISPLAY,
  PRIORITY_DISPLAY,
  PROGRAMME_DISPLAY,
  READINESS_DISPLAY,
  READINESS_UNCHECKED_DISPLAY,
  displayOf,
  reasonSentence,
  type DisplayState,
} from "./display-states";
import { formatDate, formatDayMonth } from "./format";
import { details, type Details } from "./view-state";

export interface WhySource {
  label: string;
  detail: string;
}

/** Progressive "Why?" disclosure: primary → why it matters → evidence → technical. */
export interface WhyVM {
  /** One sentence: why this matters. */
  summary: string;
  /** Where the work comes from (programme, requirement, record gap, suggestion). */
  origins: Details<string>;
  /** Plain explanation lines from the owning engine's evidence (C8 explanation, C9 window basis, completion rule). */
  evidence: Details<string>;
  /** Assumptions, limitations and unknowns, in that order (each kept, none merged into another). */
  caveats: Details<string>;
  sources: Details<WhySource>;
  /**
   * When the job was raised, and whether the latest records still raise it (F001: the explanation is the job's
   * ORIGINAL justification, kept with it; this says how it relates to now). STILL_RAISED / NO_LONGER_RAISED /
   * UNKNOWN (the latest planning run couldn't be read) / CLOSED (the job is done or closed); `text` is the farmer sentence.
   */
  raised: { label: string; current: "STILL_RAISED" | "NO_LONGER_RAISED" | "UNKNOWN" | "CLOSED"; text: string | null };
  /** How the work gets marked done. */
  completionRule: string;
  /** Technical provenance (shown only on request). */
  technical: Details<{ label: string; value: string }>;
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
  window: { state: "RECOMMENDED"; label: string; opensAt: string | null; dueAt: string | null } | { state: "NONE" };
  /** Only when C9 sourced a hard deadline — the only "Must be done before". */
  hardDeadline: { state: "HARD_DEADLINE"; label: string; dueAt: string } | { state: "NONE" };
  blockers: Details<WorkBlockerVM>;
  /** The readiness shown with the job: the first open blocker's state, else the kernel readiness. */
  headlineState: DisplayState;
  /** When the kernel completed it, and on what basis (records vs a farmer override stay distinct). */
  completed: { state: "COMPLETED"; at: string; label: string } | { state: "NOT_COMPLETED"; label: string };
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

/** `kinds`: the kinds C9 records for THIS blocker id (across the group's items), not any other blocker's. */
function blockerText(kinds: ReadonlySet<string>, status: string): string {
  if (status === "UNKNOWN") return "Waiting on information: a required record is missing or unclear, so this can't be confirmed yet.";
  if (status === "ACTIVE") {
    const legal = kinds.has("LEGAL_WINDOW");
    return legal ? "A medicine withdrawal is in force for this animal (an engine check, not a legal ruling)." : "A required check failed, so this can't go ahead yet.";
  }
  return "Cleared.";
}

/** How a job was closed, kept distinct everywhere it's shown: by records, by a farmer override, or marked done. */
export function completionBasisLabel(basis: string): string {
  return basis === "CANONICAL_EVIDENCE" ? "Closed by your records" : basis === "FARMER_OVERRIDE" ? "Marked done (override)" : "Marked done";
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
  if (w === null) return { state: "NONE" };
  const from = w.startIso === null ? null : formatDayMonth(w.startIso);
  // C9 windows are [opens, due): the last day inside is the day before `due`.
  const to = w.endIso === null ? null : formatDayMonth(w.endIso);
  const label = from && to ? `Recommended window ${from} – before ${to}` : to ? `Recommended before ${to}` : from ? `Recommended from ${from}` : "Recommended window";
  return { state: "RECOMMENDED", label, opensAt: w.startIso, dueAt: w.endIso };
}

/**
 * The "Why?" of a job from its ORIGIN (F001): the C9 group and the C8 record that raised it, captured by the replay
 * when the job was created — never looked up in a later run, which may no longer propose the work after the job
 * stays open (e.g. a back-dated weight). Evidence that wasn't kept is said to be unavailable, never borrowed.
 */
function whyOf(job: PlanJob, origin: CattlePlanJobState["origin"], current: WhyVM["raised"]["current"], base: { why: string }, directory: CattleDirectory): WhyVM {
  const group = origin?.group ?? undefined;
  const record = origin?.recommendation.state === "BOUND" ? origin.recommendation.record : null;
  // A C8 job whose record wasn't kept: its evidence is unknown, not absent.
  const recordUnavailable = origin === null || origin.recommendation.state === "UNAVAILABLE";
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
  const technical: { label: string; value: string }[] = [
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
    origins: details(origins),
    evidence: details([...new Set(evidence)]),
    caveats: details([
      ...(record?.assumptions ?? []),
      ...(record?.limitations ?? []).filter((x) => Object.hasOwn(LIMITATION_COPY, x)).map((x) => LIMITATION_COPY[x]),
      ...(record && record.expectedOutcome?.effect.state !== "EFFECT_SUPPORTED" ? ["No model estimates what this changes in weight or money."] : []),
      ...(origin === null
        ? ["The evidence this job was raised on wasn't kept, so it isn't shown."]
        : recordUnavailable
          ? ["The recommendation record behind this job couldn't be read when it was raised, so its evidence and assumptions aren't shown."]
          : []),
    ]),
    sources: details(sources),
    raised: {
      label: origin === null ? "When this was raised isn't recorded" : `Raised ${formatDate(origin.at)}`,
      current,
      text:
        current === "NO_LONGER_RAISED"
          ? "That was the reason when it was raised. The latest records no longer raise it on their own; it stays open until it's done as described below."
          : current === "UNKNOWN"
            ? "Whether the latest records still raise this couldn't be checked."
            : null,
    },
    completionRule: completionRule(job),
    technical: details(technical),
  };
}

/**
 * Whether the LATEST planning run still proposes this job — read from the replay's reconciliation (`state.current`,
 * F019), the same verdict that set the job's current blockers; never its evidence. Not recorded or a failed run →
 * UNKNOWN; a C8 action while the latest recommendations couldn't be read → UNKNOWN.
 */
function currentlyRaised(outputs: CattleOutputs, state: CattlePlanJobState): WhyVM["raised"]["current"] {
  const c = state.current;
  if (c === null || c.state === "UNAVAILABLE" || (actionKindOf(state.job) !== null && !outputs.recommendations.ok)) return "UNKNOWN";
  return c.state === "PROPOSED" ? "STILL_RAISED" : "NO_LONGER_RAISED";
}

/** The latest run's group for the job — the source of its CURRENT blockers' wording only (never the origin's). */
function currentGroupOf(outputs: CattleOutputs, state: CattlePlanJobState): CattlePlanProposalGroup | undefined {
  const key = planJobIdentityKey(state.job);
  return outputs.plan.ok ? outputs.plan.result.groups.find((g) => g.identityKey === key) : undefined;
}

export function workVM(state: CattlePlanJobState, outputs: CattleOutputs, animalId: string, directory: CattleDirectory): WorkVM {
  const job = state.job;
  const open = !["COMPLETED", "OBSOLETE", "CANCELLED"].includes(job.status);
  // F019: an open job whose current state couldn't be checked shows neither the last readiness nor the last
  // blockers as current — it says the check failed (never "Ready to do", never "no blockers").
  const unchecked = open && (state.current === null || state.current.state === "UNAVAILABLE");
  const group = currentGroupOf(outputs, state);
  const copy = titleOf(job, directory);
  const blockers: WorkBlockerVM[] = [];
  const blockerById = outputs.plan.ok ? Object.fromEntries(outputs.plan.result.blockers.map((b) => [b.id, b])) : {};
  for (const id of unchecked ? [] : job.dependencies.blockerIds) {
    const b = blockerById[id];
    const status = b?.status ?? "UNKNOWN";
    if (status === "CLEARED") continue;
    const kinds = new Set((group?.items ?? []).flatMap((i) => i.blockers.filter((x) => x.id === id).map((x) => x.kind)));
    blockers.push({ state: displayOf(BLOCKER_DISPLAY, status, "BLOCKER"), text: blockerText(kinds, status) });
  }
  const hd = job.timing.hardDeadline;
  const evaluation = unchecked ? null : state.evaluation;
  const readiness = unchecked ? READINESS_UNCHECKED_DISPLAY : displayOf(READINESS_DISPLAY, evaluation?.readiness.state ?? "NOT_EVALUATED", "READINESS");
  return {
    jobId: job.id,
    actionKind: actionKindOf(job),
    title: copy.title,
    shortTitle: copy.short,
    priority: displayOf(PRIORITY_DISPLAY, job.systemPriority.tier, "PRIORITY"),
    status: displayOf(JOB_STATUS_DISPLAY, job.status, "JOB"),
    readiness,
    completion: unchecked ? READINESS_UNCHECKED_DISPLAY : displayOf(COMPLETION_DISPLAY, evaluation?.completion.state ?? "NOT_EVALUATED", "COMPLETION"),
    open,
    window: windowOf(job),
    hardDeadline: hd === null ? { state: "NONE" } : { state: "HARD_DEADLINE", label: `Must be done before ${formatDate(hd.dueIso)}`, dueAt: hd.dueIso },
    blockers: details(blockers),
    // Every open blocker is listed; the headline is their shared state, or BLOCKERS_MIXED — never the first one's.
    headlineState: blockers.length === 0 ? readiness : new Set(blockers.map((b) => b.state.code)).size === 1 ? blockers[0].state : BLOCKERS_MIXED_DISPLAY,
    completed:
      job.completion === null
        ? { state: "NOT_COMPLETED", label: displayOf(JOB_STATUS_DISPLAY, job.status, "JOB").label }
        : { state: "COMPLETED", at: job.completion.at, label: completionBasisLabel(job.completion.basis) },
    why: whyOf(job, state.origin, open ? currentlyRaised(outputs, state) : "CLOSED", copy, directory),
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
