/**
 * Cattle C10 — herd and group view-models. Groups are C4 scope resolutions;
 * an animal whose membership is unknown / conflicting / invalid is shown as
 * unresolved (never silently placed in a group). Group figures are COUNTS of
 * per-animal states and per-animal Plan jobs — never group-level work, never
 * an average of unresolved values.
 *
 * Availability (`availability.ts`): a group whose C4 scope didn't resolve has
 * an UNAVAILABLE scope — never "0 animals"; work counts and an animal's next
 * job are UNAVAILABLE when the planning run failed — never "no work".
 */

import type { CattleDirectory, CattleOutputs } from "./cattle-outputs";
import { headlinePerformance, performanceOf } from "./animal-profile";
import { known, unavailable, type Availability } from "./availability";
import { ACTION_COPY, EVALUATION_UNAVAILABLE, IDENTITY_DISPLAY, LATEST_WEIGHT_DISPLAY, MEMBERSHIP_DISPLAY, UNAVAILABLE_DISPLAY, displayOf, type DisplayState } from "./display-states";
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
  /** The animal's first open job in Plan priority order (`null` = none open); UNAVAILABLE when the planning run failed. */
  nextWork: Availability<{ title: string; tone: DisplayState["tone"]; readiness: DisplayState } | null>;
  membership: DisplayState;
}

export interface GroupScopeVM {
  /** May legitimately be 0 (a resolved, empty group). */
  memberCount: number;
  locationLabel: string;
  members: AnimalRowVM[];
  /** Animals this group's scope could not resolve (shown, never dropped). */
  unresolved: AnimalRowVM[];
  /** Per-animal performance states counted (unresolved counted separately, never averaged). */
  performanceCounts: { state: DisplayState; count: number }[];
}

export interface GroupVM {
  groupRef: string;
  name: string;
  /** The C4 scope resolution; UNAVAILABLE when it produced nothing (never an empty group). */
  scope: Availability<GroupScopeVM>;
  /** Per-animal work counted by kind ("3 need weighing"; KNOWN empty = nothing needs attention); UNAVAILABLE when the scope or the planning run failed. */
  workCounts: Availability<{ label: string; count: number; actionKind: string | null }[]>;
}

export interface HerdVM {
  asOfLabel: string;
  viewpoint: { effectiveAt: string; knowledgeCutoff: string };
  animalCount: number;
  groups: GroupVM[];
  planning: { state: "PLANNING_OK" | "PLANNING_FAILED"; failureCodes: string[] };
  /** UNAVAILABLE when the planning run failed (never "0 open jobs"). */
  openWorkCount: Availability<number>;
}

const WORK_COUNT_LABEL: Readonly<Record<string, [string, string]>> = {
  RECORD_WEIGHT: ["needs weighing", "need weighing"],
  DECLARE_PRODUCTION_GOAL: ["has no goal", "have no goal"],
  REVIEW_WITHDRAWAL_STATUS: ["needs a withdrawal check", "need a withdrawal check"],
  RESOLVE_OBLIGATION_EVIDENCE: ["needs proof recorded", "need proof recorded"],
  COMPLETE_PROGRAMME_ACTION: ["has a programme treatment due", "have a programme treatment due"],
};

export function animalRow(outputs: CattleOutputs, animalId: string, directory: CattleDirectory, membership: DisplayState): AnimalRowVM {
  // A missing owner output (snapshot, series, performance entry) is unknown — never "not recorded" / "not weighed".
  const snap = outputs.snapshots[animalId] ?? null;
  const tag = snap?.externalIdentifiers.byScheme.find((s) => s.scheme === directory.tagScheme) ?? null;
  const series = outputs.weights?.series.find((s) => s.animalId === animalId) ?? null;
  const latest = series?.latest ?? null;
  // Each identity part says what it is: recorded, not recorded, disputed or unreadable — never "not recorded" for a conflict.
  const part = (name: string, r: { state: keyof typeof IDENTITY_DISPLAY; value: unknown }, render: () => string | null) =>
    r.state === "KNOWN" ? (render() ?? `${name} recorded (no label)`) : r.state === "UNKNOWN" ? `${name} not recorded` : r.state === "CONFLICTING_EVIDENCE" ? `${name}: records disagree` : `${name}: record can't be read`;
  let nextWork: AnimalRowVM["nextWork"] = unavailable(UNAVAILABLE_DISPLAY.PLANNING);
  if (outputs.plan.ok) {
    const next = animalWork(outputs, animalId, directory).open[0] ?? null;
    nextWork = known(next ? { title: next.title, tone: next.blockers.length > 0 ? "unknown" : next.priority.tone, readiness: next.readiness } : null);
  }
  return {
    animalId,
    tag: tag?.state === "KNOWN" ? tag.value : null,
    tagState: snap === null ? EVALUATION_UNAVAILABLE : tag ? displayOf(IDENTITY_DISPLAY, tag.state, "IDENTITY") : IDENTITY_DISPLAY.UNKNOWN,
    subtitle:
      snap === null
        ? "Details couldn't be read"
        : [part("Breed", snap.breed, () => snap.breed.value?.label ?? snap.breed.value?.code ?? null), part("Sex", snap.sex, () => (snap.sex.value === "MALE" ? "Male" : snap.sex.value === "FEMALE" ? "Female" : null))].join(" · "),
    weightLabel: latest?.state === "KNOWN" && latest.kg !== null ? formatKg(latest.kg) : null,
    weightState: series === null ? EVALUATION_UNAVAILABLE : displayOf(LATEST_WEIGHT_DISPLAY, series.latest.state, "WEIGHT"),
    weightDate: latest?.state === "KNOWN" && latest.observedAt ? formatDayMonth(latest.observedAt) : null,
    performance: headlinePerformance(performanceOf(outputs, animalId)),
    nextWork,
    membership,
  };
}

export function buildHerd(outputs: CattleOutputs, directory: CattleDirectory): HerdVM {
  const groups: GroupVM[] = outputs.groups.map(({ groupRef, scope }) => {
    const name = directory.groupLabels[groupRef] ?? "Unnamed group";
    if (scope === null) return { groupRef, name, scope: unavailable(UNAVAILABLE_DISPLAY.GROUP_SCOPE), workCounts: unavailable(UNAVAILABLE_DISPLAY.GROUP_SCOPE) };
    const members = scope.members.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.MEMBER));
    const unresolved = [
      ...scope.unknown.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.UNKNOWN)),
      ...scope.conflict.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.EVIDENCE_CONFLICT)),
      ...scope.invalid.map((id) => animalRow(outputs, id, directory, MEMBERSHIP_DISPLAY.INVALID)),
    ];
    const locations = new Set(
      scope.members.map((id) => {
        const snap = outputs.snapshots[id] ?? null;
        if (snap === null) return "Location couldn't be read";
        const loc = snap.location;
        if (loc.state === "KNOWN" && loc.value) return directory.locationLabels[loc.value.ref] ?? "Unnamed location";
        return loc.state === "CONFLICTING_EVIDENCE" ? "Location records disagree" : loc.state === "INVALID_EVIDENCE" ? "Location record can't be read" : "Location not recorded";
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
      scope: known({
        memberCount: scope.members.length,
        locationLabel: locations.size === 1 ? [...locations][0] : locations.size === 0 ? "No animals" : "Several locations",
        members,
        unresolved,
        performanceCounts: [...perf.values()].sort((a, b) => b.count - a.count || (a.state.code < b.state.code ? -1 : 1)),
      }),
      workCounts: !outputs.plan.ok
        ? unavailable(UNAVAILABLE_DISPLAY.PLANNING)
        : known(
            [...counts.entries()]
              .map(([key, v]) => {
                const words = v.actionKind ? WORK_COUNT_LABEL[v.actionKind] : undefined;
                return { label: words ? `${plural(v.count, "animal")} ${v.count === 1 ? words[0] : words[1]}` : `${plural(v.count, "animal")}: ${ACTION_COPY[key]?.short ?? key}`, count: v.count, actionKind: v.actionKind };
              })
              .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1)),
          ),
    };
  });
  const open = outputs.jobs.filter((j) => !["COMPLETED", "OBSOLETE", "CANCELLED"].includes(j.job.status)).length;
  return {
    asOfLabel: `As of ${formatDate(outputs.viewpoint.effectiveAt)}, ${formatUtcTime(outputs.viewpoint.effectiveAt)}`,
    viewpoint: outputs.viewpoint,
    animalCount: outputs.ledgers.length,
    groups,
    planning: outputs.plan.ok ? { state: "PLANNING_OK", failureCodes: [] } : { state: "PLANNING_FAILED", failureCodes: outputs.plan.issues.map((i) => i.code) },
    openWorkCount: outputs.plan.ok ? known(open) : unavailable(UNAVAILABLE_DISPLAY.PLANNING),
  };
}
