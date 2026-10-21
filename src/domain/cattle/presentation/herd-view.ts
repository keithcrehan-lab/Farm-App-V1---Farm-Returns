/**
 * Cattle C10 — herd and group view-models. Groups are C4 scope resolutions;
 * an animal whose membership is unknown / conflicting / invalid is shown as
 * unresolved (never silently placed in a group). Group figures are COUNTS of
 * per-animal states and per-animal Plan jobs — never group-level work, never
 * an average of unresolved values.
 */

import type { CattleDirectory, CattleOutputs } from "./cattle-outputs";
import { headlinePerformance, performanceOf } from "./animal-profile";
import { ACTION_COPY, EVALUATION_UNAVAILABLE, IDENTITY_DISPLAY, LATEST_WEIGHT_DISPLAY, MEMBERSHIP_DISPLAY, displayOf, type DisplayState } from "./display-states";
import { formatDate, formatDayMonth, formatKg, formatUtcTime, plural } from "./format";
import { animalWork } from "./work-view";

export interface AnimalRowVM {
  animalId: string;
  tag: string | null;
  tagState: DisplayState;
  subtitle: string;
  weightLabel: string | null;
  weightState: DisplayState;
  weightDate: string | null;
  performance: DisplayState;
  /** The animal's first open job in Plan priority order. */
  nextWork: { title: string; tone: DisplayState["tone"]; readiness: DisplayState } | null;
  membership: DisplayState;
}

export interface GroupVM {
  groupRef: string;
  name: string;
  locationLabel: string;
  memberCount: number;
  members: AnimalRowVM[];
  /** Animals this group's scope could not resolve (shown, never dropped). */
  unresolved: AnimalRowVM[];
  /** Per-animal work counted by kind ("3 need weighing"). */
  workCounts: { label: string; count: number; actionKind: string | null }[];
  /** Per-animal performance states counted (unresolved counted separately, never averaged). */
  performanceCounts: { state: DisplayState; count: number }[];
  scopeState: "RESOLVED" | "SCOPE_FAILED";
}

export interface HerdVM {
  asOfLabel: string;
  viewpoint: { effectiveAt: string; knowledgeCutoff: string };
  animalCount: number;
  groups: GroupVM[];
  planning: { state: "PLANNING_OK" | "PLANNING_FAILED"; failureCodes: string[] };
  openWorkCount: number;
}

const WORK_COUNT_LABEL: Readonly<Record<string, [string, string]>> = {
  RECORD_WEIGHT: ["needs weighing", "need weighing"],
  DECLARE_PRODUCTION_GOAL: ["has no goal", "have no goal"],
  REVIEW_WITHDRAWAL_STATUS: ["needs a withdrawal check", "need a withdrawal check"],
  RESOLVE_OBLIGATION_EVIDENCE: ["needs proof recorded", "need proof recorded"],
  COMPLETE_PROGRAMME_ACTION: ["has a programme treatment due", "have a programme treatment due"],
};

export function animalRow(outputs: CattleOutputs, animalId: string, directory: CattleDirectory, membership: DisplayState): AnimalRowVM {
  const snap = outputs.snapshots[animalId] ?? null;
  const tag = snap?.externalIdentifiers.byScheme.find((s) => s.scheme === directory.tagScheme) ?? null;
  const series = outputs.weights?.series.find((s) => s.animalId === animalId) ?? null;
  const latest = series?.latest ?? null;
  const work = animalWork(outputs, animalId, directory);
  const next = work.open[0] ?? null;
  const breed = snap?.breed.state === "KNOWN" ? snap.breed.value?.label ?? null : null;
  const sex = snap?.sex.state === "KNOWN" ? (snap.sex.value === "MALE" ? "Male" : "Female") : null;
  return {
    animalId,
    tag: tag?.state === "KNOWN" ? tag.value : null,
    tagState: tag ? displayOf(IDENTITY_DISPLAY, tag.state, "IDENTITY") : IDENTITY_DISPLAY.UNKNOWN,
    subtitle: [breed ?? "Breed not recorded", sex ?? "Sex not recorded"].join(" · "),
    weightLabel: latest?.state === "KNOWN" && latest.kg !== null ? formatKg(latest.kg) : null,
    weightState: outputs.weights === null ? EVALUATION_UNAVAILABLE : latest ? displayOf(LATEST_WEIGHT_DISPLAY, latest.state, "WEIGHT") : LATEST_WEIGHT_DISPLAY.NONE,
    weightDate: latest?.state === "KNOWN" && latest.observedAt ? formatDayMonth(latest.observedAt) : null,
    performance: headlinePerformance(performanceOf(outputs, animalId), outputs.performance !== null),
    nextWork: next ? { title: next.title, tone: next.blockers.length > 0 ? "unknown" : next.priority.tone, readiness: next.readiness } : null,
    membership,
  };
}

export function buildHerd(outputs: CattleOutputs, directory: CattleDirectory): HerdVM {
  const groups: GroupVM[] = outputs.groups.map(({ groupRef, scope }) => {
    const name = directory.groupLabels[groupRef] ?? "Unnamed group";
    if (scope === null) return { groupRef, name, locationLabel: "", memberCount: 0, members: [], unresolved: [], workCounts: [], performanceCounts: [], scopeState: "SCOPE_FAILED" };
    const members = scope.members.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.MEMBER));
    const unresolved = [
      ...scope.unknown.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.UNKNOWN)),
      ...scope.conflict.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.EVIDENCE_CONFLICT)),
      ...scope.invalid.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.INVALID)),
    ];
    const locations = new Set(
      scope.members.map((id) => {
        const loc = outputs.snapshots[id]?.location;
        return loc?.state === "KNOWN" && loc.value ? (directory.locationLabels[loc.value.ref] ?? "Unnamed location") : "Location not recorded";
      }),
    );
    const counts = new Map<string, { count: number; actionKind: string | null }>();
    for (const id of scope.members) {
      for (const w of animalWork(outputs, id, directory).open) {
        const key = w.actionKind ?? w.shortTitle;
        counts.set(key, { count: (counts.get(key)?.count ?? 0) + 1, actionKind: w.actionKind });
      }
    }
    const perf = new Map<string, { state: DisplayState; count: number }>();
    for (const m of members) perf.set(m.performance.code, { state: m.performance, count: (perf.get(m.performance.code)?.count ?? 0) + 1 });
    return {
      groupRef,
      name,
      locationLabel: locations.size === 1 ? [...locations][0] : locations.size === 0 ? "No animals" : "Several locations",
      memberCount: scope.members.length,
      members,
      unresolved,
      workCounts: [...counts.entries()]
        .map(([key, v]) => {
          const words = v.actionKind ? WORK_COUNT_LABEL[v.actionKind] : undefined;
          return { label: words ? `${plural(v.count, "animal")} ${v.count === 1 ? words[0] : words[1]}` : `${plural(v.count, "animal")}: ${ACTION_COPY[key]?.short ?? key}`, count: v.count, actionKind: v.actionKind };
        })
        .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1)),
      performanceCounts: [...perf.values()].sort((a, b) => b.count - a.count || (a.state.code < b.state.code ? -1 : 1)),
      scopeState: "RESOLVED",
    };
  });
  const open = outputs.jobs.filter((j) => !["COMPLETED", "OBSOLETE", "CANCELLED"].includes(j.job.status)).length;
  return {
    asOfLabel: `As of ${formatDate(outputs.viewpoint.effectiveAt)}, ${formatUtcTime(outputs.viewpoint.effectiveAt)}`,
    viewpoint: outputs.viewpoint,
    animalCount: outputs.ledgers.length,
    groups,
    planning: outputs.plan.ok ? { state: "PLANNING_OK", failureCodes: [] } : { state: "PLANNING_FAILED", failureCodes: outputs.plan.issues.map((i) => i.code) },
    openWorkCount: open,
  };
}
