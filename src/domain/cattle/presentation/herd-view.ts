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
import { ACTION_COPY, EMPTY_DISPLAY, EVALUATION_UNAVAILABLE, IDENTITY_DISPLAY, MEMBERSHIP_DISPLAY, NO_OPEN_WORK, UNAVAILABLE_DISPLAY, displayOf, type DisplayState } from "./display-states";
import { formatDate, formatUtcTime, plural } from "./format";
import { details, listingOf, unavailableListing, type Details, type Listing } from "./view-state";
import { latestWeightOf, weightRowOf } from "./weight-view";
import { animalWork } from "./work-view";

export interface AnimalRowVM {
  animalId: string;
  tag: string | null;
  tagState: DisplayState;
  subtitle: string;
  weightLabel: string | null;
  weightState: DisplayState;
  /** "14 Oct", or "14 Oct · tape estimate" — an estimate never reads as a weighing. */
  weightDate: string | null;
  performance: DisplayState;
  /** The animal's first open job in Plan priority order; NONE_OPEN (known) or UNAVAILABLE when the planning run failed. */
  nextWork: { state: "JOB"; title: string; tone: DisplayState["tone"]; readiness: DisplayState } | { state: "NONE_OPEN"; display: DisplayState } | { state: "UNAVAILABLE"; display: DisplayState };
  membership: DisplayState;
}

export interface GroupScopeVM {
  /** May legitimately be 0 (a resolved, empty group). */
  memberCount: number;
  /** "12 animals · Field 6" (the count is the resolved membership; 0 is a real, resolved 0). */
  summary: string;
  locationLabel: string;
  /** EMPTY = the scope resolved with no members. */
  members: Listing<AnimalRowVM>;
  /** Animals this group's scope could not resolve (shown, never dropped). */
  unresolved: Details<AnimalRowVM>;
  /** "2 animals with unresolved group records", or `null` when every animal resolved. */
  unresolvedNote: string | null;
  /** Per-animal performance states counted (unresolved counted separately, never averaged). */
  performanceCounts: Details<{ state: DisplayState; count: number }>;
}

export interface GroupVM {
  groupRef: string;
  name: string;
  /** The C4 scope resolution; UNAVAILABLE when it produced nothing (never an empty group). */
  scope: Availability<GroupScopeVM>;
  /** Per-animal work counted by kind ("3 need weighing"; EMPTY = nothing currently needs attention); UNAVAILABLE when the scope or the planning run failed. */
  workCounts: Listing<{ label: string; count: number; actionKind: string | null }>;
}

export interface HerdVM {
  asOfLabel: string;
  viewpoint: { effectiveAt: string; knowledgeCutoff: string };
  animalCount: number;
  /** "12 animals in 3 groups · 4 open jobs", "No animals recorded · …", or "… · work couldn't be checked". */
  summary: string;
  /** Every group (a resolved group may be known-empty); EMPTY only when no group is set up. */
  groups: Listing<GroupVM>;
  /** What the herd screen lists: the groups, or EMPTY saying why there's nothing to list (no animals, or no groups set up). */
  overview: Listing<GroupVM>;
  planning: { state: "PLANNING_OK" } | { state: "PLANNING_FAILED"; failureCodes: Details<string> };
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
  const weight = weightRowOf(latestWeightOf(series));
  // Each identity part says what it is: recorded, not recorded, disputed or unreadable — never "not recorded" for a conflict.
  const part = (name: string, r: { state: keyof typeof IDENTITY_DISPLAY; value: unknown }, render: () => string | null) =>
    r.state === "KNOWN" ? (render() ?? `${name} recorded (no label)`) : r.state === "UNKNOWN" ? `${name} not recorded` : r.state === "CONFLICTING_EVIDENCE" ? `${name}: records disagree` : `${name}: record can't be read`;
  let nextWork: AnimalRowVM["nextWork"] = { state: "UNAVAILABLE", display: UNAVAILABLE_DISPLAY.PLANNING };
  if (outputs.plan.ok) {
    // first-item: the next job in Plan-kernel priority order (the kernel's own ordering) — the row is a pointer to the animal, whose page lists every job.
    const next = animalWork(outputs, animalId, directory).open[0] ?? null;
    nextWork = next ? { state: "JOB", title: next.title, tone: next.blockers.length > 0 ? "unknown" : next.priority.tone, readiness: next.readiness } : { state: "NONE_OPEN", display: NO_OPEN_WORK };
  }
  return {
    animalId,
    tag: tag?.state === "KNOWN" ? tag.value : null,
    tagState: snap === null ? EVALUATION_UNAVAILABLE : tag ? displayOf(IDENTITY_DISPLAY, tag.state, "IDENTITY") : IDENTITY_DISPLAY.UNKNOWN,
    subtitle:
      snap === null
        ? "Details couldn't be read"
        : [part("Breed", snap.breed, () => snap.breed.value?.label ?? snap.breed.value?.code ?? null), part("Sex", snap.sex, () => (snap.sex.value === "MALE" ? "Male" : snap.sex.value === "FEMALE" ? "Female" : null))].join(" · "),
    weightLabel: weight.label,
    weightState: weight.state,
    weightDate: weight.dateLine,
    performance: headlinePerformance(performanceOf(outputs, animalId)),
    nextWork,
    membership,
  };
}

export function buildHerd(outputs: CattleOutputs, directory: CattleDirectory): HerdVM {
  const groups: GroupVM[] = outputs.groups.map(({ groupRef, scope }) => {
    const name = directory.groupLabels[groupRef] ?? "Unnamed group";
    if (scope === null) return { groupRef, name, scope: unavailable(UNAVAILABLE_DISPLAY.GROUP_SCOPE), workCounts: unavailableListing(UNAVAILABLE_DISPLAY.GROUP_SCOPE) };
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
    const locationLabel = locations.size === 1 ? [...locations][0] : locations.size === 0 ? "No animals" : "Several locations";
    return {
      groupRef,
      name,
      scope: known({
        memberCount: scope.members.length,
        summary: `${plural(scope.members.length, "animal")} · ${locationLabel}`,
        locationLabel,
        members: listingOf(members, EMPTY_DISPLAY.GROUP_ANIMALS),
        unresolved: details(unresolved),
        unresolvedNote: unresolved.length === 0 ? null : `${plural(unresolved.length, "animal")} with unresolved group records`,
        performanceCounts: details([...perf.values()].sort((a, b) => b.count - a.count || (a.state.code < b.state.code ? -1 : 1))),
      }),
      workCounts: !outputs.plan.ok
        ? unavailableListing(UNAVAILABLE_DISPLAY.PLANNING)
        : listingOf(
            [...counts.entries()]
              .map(([key, v]) => {
                const words = v.actionKind ? WORK_COUNT_LABEL[v.actionKind] : undefined;
                // first-item: `words` is a [singular, plural] wording pair, not a collection of results.
                return { label: words ? `${plural(v.count, "animal")} ${v.count === 1 ? words[0] : words[1]}` : `${plural(v.count, "animal")}: ${ACTION_COPY[key]?.short ?? key}`, count: v.count, actionKind: v.actionKind };
              })
              .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1)),
            NO_OPEN_WORK,
          ),
    };
  });
  const open = outputs.jobs.filter((j) => !["COMPLETED", "OBSOLETE", "CANCELLED"].includes(j.job.status)).length;
  const animalCount = outputs.ledgers.length;
  const openWorkCount: Availability<number> = outputs.plan.ok ? known(open) : unavailable(UNAVAILABLE_DISPLAY.PLANNING);
  return {
    asOfLabel: `As of ${formatDate(outputs.viewpoint.effectiveAt)}, ${formatUtcTime(outputs.viewpoint.effectiveAt)}`,
    viewpoint: outputs.viewpoint,
    animalCount,
    summary: `${animalCount === 0 ? `${EMPTY_DISPLAY.HERD_ANIMALS.label}` : `${plural(animalCount, "animal")} in ${plural(groups.length, "group")}`}${openWorkCount.state === "KNOWN" ? ` · ${plural(openWorkCount.value, "open job")}` : ` · ${openWorkCount.display.label.toLowerCase()}`}`,
    groups: listingOf(groups, EMPTY_DISPLAY.HERD_GROUPS),
    overview: animalCount === 0 ? { state: "EMPTY", display: EMPTY_DISPLAY.HERD_ANIMALS } : listingOf(groups, EMPTY_DISPLAY.HERD_GROUPS),
    planning: outputs.plan.ok ? { state: "PLANNING_OK" } : { state: "PLANNING_FAILED", failureCodes: details(outputs.plan.issues.map((i) => i.code)) },
    openWorkCount,
  };
}
