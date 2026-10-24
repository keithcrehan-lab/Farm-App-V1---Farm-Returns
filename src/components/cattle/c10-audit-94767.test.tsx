/**
 * Cattle C10 — strict audit 94767 (`audit-20261023T184003Z-94767`).
 *
 * F019 CURRENT_PROPOSAL_RECONCILIATION (same replay / job-lifetime mechanism as F001): an open job whose identity a
 * later C9 run proposed again was skipped, so it kept the blockers it was created with — a newly raised blocker never
 * reached its readiness ("Ready to do" beside an unresolved weight conflict). The replay now reconciles every open
 * job with the latest run (`reconcileJobs`): origin and lifecycle kept, current blockers / priority / proposal
 * presence replaced, a failed run said to be unchecked.
 *
 * F020 PERFORMANCE_PROVENANCE_RENDERING: the profile's performance verdict ("On track") and projection were shown
 * without the target's source / version or the projection's assumptions, and an animal with no work had no "Why?"
 * at all. The profile now has "Why this result?" beside the verdict, from C5's outputs only.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: vi.fn(() => new Promise(() => {})), projectCattleWeight: vi.fn(() => new Promise(() => {})), loadCattleHerd: vi.fn() }));

import type { PlanBlocker } from "@/domain/plan";
import { buildAnimalProfile, workVM, type AnimalProfileVM, type CattleOutputs, type WorkVM } from "@/domain/cattle/presentation";
import type { CattlePlanResult } from "@/domain/cattle/plan-interface";
import { animalIdOf } from "@/server/cattle-demo/demo-herd";
import { reconcileJobs, replayCattleDemo, type DemoJobState } from "@/server/cattle-demo/demo-replay";
import { DEMO_DIRECTORY, demoAnimalView } from "@/server/cattle-demo/demo-service";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { CattleDemoSessionProvider } from "./session/CattleDemoSessionProvider";
import type { CattleDemoSession } from "./session/demo-session";

afterEach(() => cleanup());

const T = "1442"; // no weight in view: C8 raises RECORD_WEIGHT at the base run, with no blocker
const ID = animalIdOf(T);
const WEIGH = "CATTLE_RECOMMENDATION:RECORD_WEIGHT";
const EMPTY: CattleDemoSession = { version: 1, events: [] };
const w = (eventId: string, kg: number, observedDate: string | null) => ({ kind: "RECORD_WEIGHT" as const, eventId, tag: T, kg, observedDate });
const BACKDATED: CattleDemoSession = { version: 1, events: [w("w1", 500, "2026-10-15")] };
/** The auditor's reproduction: two back-dated weights on the same day that disagree. */
const CONFLICT: CattleDemoSession = { version: 1, events: [w("w1", 500, "2026-10-15"), w("w2", 510, "2026-10-15")] };
const T1 = "2026-10-16T10:00:00Z";
const T2 = "2026-10-16T11:00:00Z";
const T3 = "2026-10-16T12:00:00Z";
const noC8 = () => ({ ok: false, issues: [] }) as never;

const base = () => {
  const o = replayCattleDemo(EMPTY, { animalIds: [ID] });
  if (!o.plan.ok) throw new Error("fixture plan");
  return { o, r: o.plan.result };
};
const weighState = (jobs: readonly DemoJobState[], animal = ID) => {
  const open = jobs.filter((j) => j.job.actionKey === WEIGH && j.job.id.includes(animal));
  if (open.length === 0) throw new Error("no RECORD_WEIGHT job");
  return open;
};
const blocker = (id: string, status: PlanBlocker["status"], kind: PlanBlocker["kind"] = "OTHER"): PlanBlocker => ({ id, kind, status, description: `test blocker ${id}` });
/** The run `r` with the RECORD_WEIGHT proposal of `animal` depending on exactly `bs` (shared blockers listed once). */
function withBlockers(r: CattlePlanResult, bs: PlanBlocker[], animal = ID): CattlePlanResult {
  return {
    ...r,
    proposals: r.proposals.map((p) => (p.actionKey === WEIGH && p.id.includes(animal) ? { ...p, dependencies: { jobIds: [], blockerIds: bs.map((b) => b.id) } } : p)),
    blockers: [...r.blockers.filter((b) => !bs.some((x) => x.id === b.id)), ...bs],
  };
}
const withoutWeighProposal = (r: CattlePlanResult): CattlePlanResult => ({ ...r, proposals: r.proposals.filter((p) => !(p.actionKey === WEIGH && p.id.includes(ID))), groups: r.groups.filter((g) => !(g.identityKey.includes("RECORD_WEIGHT") && g.identityKey.includes(ID))) });
const ok = (result: CattlePlanResult) => ({ ok: true as const, result });

const weighWork = (s: CattleDemoSession): WorkVM => {
  const p = demoAnimalView(s, T)!.profile;
  if (p.work.open.state !== "ITEMS") throw new Error(p.work.open.state);
  const x = [p.work.open.primary, ...p.work.open.others].find((v) => v.actionKind === "RECORD_WEIGHT");
  if (!x) throw new Error("no open RECORD_WEIGHT job");
  return x;
};
const tech = (x: WorkVM, label: string) => [...x.why.technical].filter((t) => t.label === label).map((t) => t.value);
const evidenceOf = (x: WorkVM) => ({ origins: [...x.why.origins], evidence: [...x.why.evidence], caveats: [...x.why.caveats], sources: [...x.why.sources], pack: tech(x, "Evidence pack"), source: tech(x, "Source output (C8_RECOMMENDATION)"), limitations: tech(x, "Limitation"), unknowns: tech(x, "Unknown"), raisedLabel: x.why.raised.label });

describe("F019 — an open job takes its CURRENT blockers from the latest matching proposal; its origin never changes", { timeout: 120_000 }, () => {
  it("1. created with no blockers: ready, current PROPOSED", () => {
    const { o } = base();
    const [j] = weighState(o.jobs);
    expect(j.job.dependencies.blockerIds).toEqual([]);
    expect(j.evaluation?.readiness.state).toBe("READY");
    expect(j.current.state).toBe("PROPOSED");
  });

  it("2–4. a blocker appears, changes and clears: readiness follows it; origin, status and completion cut-off never change", () => {
    const { o, r } = base();
    const [j0] = weighState(o.jobs);
    const origin = structuredClone(j0.origin);
    const contract = structuredClone(j0.job.completionContract);
    const B1 = blocker("TEST-B1", "UNKNOWN");
    const B2 = blocker("TEST-B2", "ACTIVE", "WEATHER");

    const s1 = reconcileJobs(o.jobs, ok(withBlockers(r, [B1])), T1, noC8);
    const [j1] = weighState(s1);
    expect(j1.job.dependencies.blockerIds).toEqual(["TEST-B1"]);
    expect(j1.evaluation?.readiness.state).toBe("WAITING_FOR_BLOCKER");
    expect(j1.events.some((e) => e.type === "DEPENDENCY_CHANGED")).toBe(true);

    const s2 = reconcileJobs(s1, ok(withBlockers(r, [B2])), T2, noC8);
    const [j2] = weighState(s2);
    expect(j2.job.dependencies.blockerIds).toEqual(["TEST-B2"]); // the old blocker is not kept beside the new one
    expect(j2.evaluation?.readiness.state).toBe("WAITING_FOR_WEATHER");

    const s3 = reconcileJobs(s2, ok(r), T3, noC8);
    const [j3] = weighState(s3);
    expect(j3.job.dependencies.blockerIds).toEqual([]);
    expect(j3.evaluation?.readiness.state).toBe("READY");
    // A blocker the run reports CLEARED is still a dependency, but holds nothing.
    const [jc] = weighState(reconcileJobs(s2, ok(withBlockers(r, [{ ...B2, status: "CLEARED" }])), T3, noC8));
    expect(jc.evaluation?.readiness.state).toBe("READY");

    for (const [s] of [[s1], [s2], [s3]] as const) {
      const [j] = weighState(s);
      expect(s.filter((x) => x.job.actionKey === WEIGH)).toHaveLength(1); // the same job — never a second one
      expect(j.job.id).toBe(j0.job.id);
      expect(j.origin).toEqual(origin);
      expect(j.job.completionContract).toEqual(contract);
      expect(j.job.status).toBe("PROPOSED");
      expect(j.createdAt).toBe(j0.createdAt);
    }
    // Rendered state: a current blocker is listed, the cleared one is not shown as active.
    const outputs = (s: DemoJobState[], res: CattlePlanResult) => ({ ...o, plan: ok(res), jobs: s }) as CattleOutputs;
    const v2 = workVM(weighState(s2)[0], outputs(s2, withBlockers(r, [B2])), ID, DEMO_DIRECTORY);
    expect(v2.blockers).toHaveLength(1);
    expect(v2.headlineState.label).toBe("Blocked");
    const v3 = workVM(weighState(s3)[0], outputs(s3, r), ID, DEMO_DIRECTORY);
    expect(v3.blockers).toHaveLength(0);
    expect(v3.headlineState.label).toBe("Ready to do");
  });

  it("5. the auditor's reproduction: two disagreeing back-dated weights hold the job — never 'Ready to do'", () => {
    const o = replayCattleDemo(CONFLICT, { animalIds: [ID] });
    const [j] = weighState(o.jobs);
    expect(j.current.state).toBe("PROPOSED");
    expect(j.job.dependencies.blockerIds.length).toBeGreaterThan(0);
    expect(j.evaluation?.readiness.state).not.toBe("READY");
    if (!o.plan.ok) throw new Error("plan");
    const unknown = o.plan.result.blockers.filter((b) => j.job.dependencies.blockerIds.includes(b.id));
    expect(unknown.map((b) => b.status)).toEqual(["UNKNOWN"]);
    expect(unknown[0].id).toContain("WEIGHT_EVIDENCE_CONFLICT");
    const x = weighWork(CONFLICT);
    expect(x.status.label).toBe("To do");
    expect(x.headlineState.label).not.toBe("Ready to do");
    expect(x.blockers).toHaveLength(1);
    expect(x.blockers[0].state.label).toBe("Waiting on information");
    expect(x.why.raised.current).toBe("STILL_RAISED");
    // The explanation is still the one it was raised on (F001).
    expect(evidenceOf(x)).toEqual(evidenceOf(weighWork(EMPTY)));
  });

  it("6. resolving the conflict: a weighing on or after the job was raised closes it by its original rule", () => {
    const resolved: CattleDemoSession = { version: 1, events: [...CONFLICT.events, w("w3", 506, null)] };
    const [j] = weighState(replayCattleDemo(resolved, { animalIds: [ID] }).jobs);
    expect(j.job.status).toBe("COMPLETED");
    expect(j.job.completion?.basis).toBe("CANONICAL_EVIDENCE");
    expect(j.origin).toEqual(weighState(replayCattleDemo(EMPTY, { animalIds: [ID] }).jobs)[0].origin);
  });

  it("7. the matching proposal disappears: job kept with its origin, NOT_PROPOSED, and no earlier blocker kept", () => {
    const { o, r } = base();
    const [j0] = weighState(o.jobs);
    const s1 = reconcileJobs(o.jobs, ok(withBlockers(r, [blocker("TEST-B1", "UNKNOWN")])), T1, noC8);
    const s2 = reconcileJobs(s1, ok(withoutWeighProposal(r)), T2, noC8);
    const [j] = weighState(s2);
    expect(j.current).toEqual({ state: "NOT_PROPOSED", at: T2 });
    expect(j.job.dependencies.blockerIds).toEqual([]);
    expect(j.job.status).toBe("PROPOSED");
    expect(j.origin).toEqual(j0.origin);
    // The real path: the back-dated weight (F001) — no longer raised, no stale blocker, evidence unchanged.
    const back = replayCattleDemo(BACKDATED, { animalIds: [ID] });
    const [jb] = weighState(back.jobs);
    expect(jb.current.state).toBe("NOT_PROPOSED");
    expect(jb.job.dependencies.blockerIds).toEqual([]);
    expect(weighWork(BACKDATED).why.raised.current).toBe("NO_LONGER_RAISED");
  });

  it("8. the latest run failed: current state UNAVAILABLE — never 'no blockers', 'no longer raised' or the last readiness", () => {
    const { o, r } = base();
    const s1 = reconcileJobs(o.jobs, ok(withBlockers(r, [blocker("TEST-B1", "UNKNOWN")])), T1, noC8);
    const s2 = reconcileJobs(s1, { ok: false }, T2, noC8);
    const [j1] = weighState(s1);
    const [j] = weighState(s2);
    expect(j.current).toEqual({ state: "UNAVAILABLE", at: T2 });
    expect(j.job).toEqual(j1.job); // nothing re-evaluated without the run
    expect(j.origin).toEqual(j1.origin);
    const v = workVM(j, { ...o, plan: { ok: false, issues: [] }, jobs: s2 } as unknown as CattleOutputs, ID, DEMO_DIRECTORY);
    expect(v.headlineState.label).toBe("Current status couldn't be checked");
    expect(v.readiness.label).toBe("Current status couldn't be checked");
    expect(v.readiness.label).not.toBe("Ready to do");
    expect(v.blockers).toHaveLength(0);
    expect(v.why.raised.current).toBe("UNKNOWN");
    expect(v.why.raised.text).toBe("Whether the latest records still raise this couldn't be checked.");
    // Not recorded at all: the same — unknown, never fresh.
    const unrecorded = workVM({ ...j1, current: null }, { ...o, jobs: s1 } as CattleOutputs, ID, DEMO_DIRECTORY);
    expect(unrecorded.why.raised.current).toBe("UNKNOWN");
    expect(unrecorded.headlineState.label).toBe("Current status couldn't be checked");
  });

  it("9. repeated identical replay is idempotent and adds no audit events", () => {
    const { o, r } = base();
    const run = ok(withBlockers(r, [blocker("TEST-B1", "UNKNOWN")]));
    const once = reconcileJobs(o.jobs, run, T1, noC8);
    const again = reconcileJobs(once, run, T1, noC8);
    const kept = (s: DemoJobState[]) => s.map((j) => ({ job: j.job, origin: j.origin, current: j.current, events: j.events, readiness: j.evaluation?.readiness }));
    expect(kept(again)).toEqual(kept(once));
    const later = reconcileJobs(once, run, T2, noC8);
    expect(later.map((j) => j.events.length)).toEqual(once.map((j) => j.events.length));
    expect(replayCattleDemo(CONFLICT, { animalIds: [ID] })).toEqual(replayCattleDemo(structuredClone(CONFLICT), { animalIds: [ID] }));
  });

  it("10–11. the origin is identical across every replay above, and the F001 back-dated case still shows its evidence", () => {
    const first = evidenceOf(weighWork(EMPTY));
    expect(first.pack).toHaveLength(1);
    for (const s of [BACKDATED, CONFLICT, { version: 1 as const, events: [...CONFLICT.events, w("w4", 499, "2026-10-14")] }]) expect(evidenceOf(weighWork(s))).toEqual(first);
    const { o, r } = base();
    const [j0] = weighState(o.jobs);
    let s: DemoJobState[] = o.jobs;
    for (const [i, run] of [ok(withBlockers(r, [blocker("A", "UNKNOWN")])), { ok: false as const }, ok(withoutWeighProposal(r)), ok(r)].entries()) {
      s = reconcileJobs(s, run, `2026-10-16T1${i}:30:00Z`, noC8);
      expect(weighState(s)[0].origin).toEqual(j0.origin);
    }
  });

  it("12. two jobs of the same broad action never cross-match (different animal, or a different window)", () => {
    const herd = replayCattleDemo(EMPTY);
    if (!herd.plan.ok) throw new Error("herd plan");
    const r = herd.plan.result;
    const [a] = weighState(herd.jobs, animalIdOf("1438"));
    const [b] = weighState(herd.jobs, ID);
    expect(a.job.dependencies.blockerIds.length).toBeGreaterThan(0); // 1438's own conflict
    const s = reconcileJobs(herd.jobs, ok(withBlockers(r, [blocker("ONLY-1442", "ACTIVE")])), T1, noC8);
    expect(weighState(s, animalIdOf("1438"))[0].job.dependencies).toEqual(a.job.dependencies);
    expect(weighState(s, ID)[0].job.dependencies.blockerIds).toEqual(["ONLY-1442"]);
    expect(b.job.dependencies.blockerIds).toEqual([]);
    // Same action and animal, different recommended window: separate work (the Plan identity includes the window).
    const { o, r: r1 } = base();
    const p = r1.proposals.find((x) => x.actionKey === WEIGH)!;
    const windowed = { ...p, id: `${p.id}-W`, timing: { ...p.timing, recommendedWindow: { kind: "RECOMMENDED_WINDOW" as const, startIso: "2026-10-20T00:00:00Z", endIso: "2026-10-27T00:00:00Z", basis: "TEST" } } };
    const s2 = reconcileJobs(o.jobs, ok({ ...r1, proposals: r1.proposals.map((x) => (x === p ? windowed : x)) }), T1, noC8);
    const weigh = s2.filter((x) => x.job.actionKey === WEIGH);
    expect(weigh).toHaveLength(2);
    expect(weigh.find((x) => x.job.id === p.id)!.current.state).toBe("NOT_PROPOSED");
    expect(weigh.find((x) => x.job.id === windowed.id)!.current.state).toBe("PROPOSED");
  });

  it("13–14. a closed job stays closed; the same work proposed again is a NEW job with its own origin and cut-off", () => {
    const { o, r } = base();
    const [j0] = weighState(o.jobs);
    const closed = o.jobs.map((j) => (j === j0 ? { ...j, job: { ...j.job, status: "COMPLETED" as const, completion: { basis: "CANONICAL_EVIDENCE" as const, at: T1, evidenceRefs: ["X"] } } } : j));
    const later = { ...r, proposals: r.proposals.map((p) => (p.id === j0.job.id ? { ...p, completionContract: { ...p.completionContract, notBeforeIso: T2 } as typeof p.completionContract } : p)) };
    const s = reconcileJobs(closed, ok(later), T2, noC8);
    const weigh = s.filter((x) => x.job.actionKey === WEIGH);
    expect(weigh).toHaveLength(2);
    const old = weigh.find((x) => x.job.id === j0.job.id)!;
    const before = closed.find((x) => x.job.id === j0.job.id)!;
    expect(old.job.status).toBe("COMPLETED"); // never reopened
    expect(old.job.completion).toEqual(before.job.completion);
    expect(old.job.dependencies).toEqual(before.job.dependencies);
    expect(old.origin).toEqual(before.origin);
    expect(old.current).toEqual(before.current);
    const fresh = weigh.find((x) => x.job.id !== j0.job.id)!;
    expect(fresh.job.id).toBe(`${j0.job.id}#2`);
    expect(fresh.job.status).toBe("PROPOSED");
    expect(fresh.createdAt).toBe(T2);
    expect(fresh.origin.at).toBe(T2);
    expect(fresh.job.completionContract).toEqual(later.proposals.find((p) => p.id === j0.job.id)!.completionContract);
    // Proposed again while the new one is open: no third job.
    expect(reconcileJobs(s, ok(later), T3, noC8).filter((x) => x.job.actionKey === WEIGH)).toHaveLength(2);
    // The real path: a weighing today closes the job and the work is not raised again.
    const done = replayCattleDemo({ version: 1, events: [w("w1", 500, null)] }, { animalIds: [ID] });
    expect(weighState(done.jobs).map((x) => x.job.status)).toEqual(["COMPLETED"]);
  });

  it("system priority is current evaluation: refreshed from the matching proposal through the kernel's audited mutation", () => {
    const { o, r } = base();
    const [j0] = weighState(o.jobs);
    const tier = j0.job.systemPriority.tier === "HARD_OBLIGATION" ? ("ROUTINE_MANAGEMENT" as const) : ("HARD_OBLIGATION" as const);
    const s = reconcileJobs(o.jobs, ok({ ...r, proposals: r.proposals.map((p) => (p.id === j0.job.id ? { ...p, systemPriority: { tier, basis: "TEST" } } : p)) }), T1, noC8);
    const [j] = weighState(s);
    expect(j.job.systemPriority).toEqual({ tier, basis: "TEST" });
    expect(j.events.some((e) => e.type === "SYSTEM_PRIORITY_CHANGED")).toBe(true);
    expect(j.origin).toEqual(j0.origin);
  });
});

// ---------------------------------------------------------------------------
// F020
// ---------------------------------------------------------------------------

const profileOf = (tag: string, s: CattleDemoSession = EMPTY) => demoAnimalView(s, tag)!;
const explanationOf = (p: AnimalProfileVM) => p.performanceExplanation;
const lines = (p: AnimalProfileVM) => [explanationOf(p).result, ...explanationOf(p).targets.flatMap((t) => [t.title, ...t.lines]), ...explanationOf(p).projection, ...explanationOf(p).assumptions, ...explanationOf(p).limitations];
/** A profile built from the 1427 outputs with C5's comparisons replaced (several / mixed / conflict / unsourced). */
function profileWith(edit: (o: CattleOutputs) => void): AnimalProfileVM {
  const o = structuredClone(replayCattleDemo(EMPTY, { animalIds: [animalIdOf("1427")] })) as CattleOutputs;
  edit(o);
  return buildAnimalProfile(o, animalIdOf("1427"), DEMO_DIRECTORY, { state: "UNAVAILABLE" } as never);
}
const perf1427 = (o: CattleOutputs) => o.performance!.animals.find((a) => a.animalId === animalIdOf("1427"))!;
function renderProfile(view: ReturnType<typeof profileOf>, tag: string, profile = view.profile) {
  render(
    <CattleDemoSessionProvider>
      <AnimalProfileScreen initial={{ ...view, profile }} tag={tag} scenario="STANDARD" />
    </CattleDemoSessionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Why this result?" }));
  return screen.getByRole("button", { name: "Why this result?" }).parentElement!.textContent ?? "";
}

describe("F020 — the performance verdict explains itself where it is shown", { timeout: 120_000 }, () => {
  it("1, 5, 7, 9. one target, a projection, no open work (1427): target source and version, projection basis and assumptions — rendered", () => {
    const view = profileOf("1427");
    const p = view.profile;
    expect(p.work.open.state).toBe("EMPTY"); // no Plan job — the explanation can't come from a "Why?"
    expect(p.performanceState.label).toBe("On track");
    const e = explanationOf(p);
    expect(e.result).toBe("On track");
    expect(e.targets).toHaveLength(1);
    expect([...e.targets[0].lines]).toEqual([
      "Result: On track",
      "Daily gain compared: 1.08 kg/day",
      "Target version v1 · source recorded with it: SYNTH-SRC-TARGETS, version v1",
      "Review state recorded with the target: production",
      "Based on 2 weight records.",
    ]);
    expect(e.projection[0]).toMatch(/^609 kg by 4 Dec 2026 — Projected — A straight-line projection of recent daily gain/);
    expect([...e.projection]).toContain("Starts from the weighing on 14 Sep 2026 and continues 1.08 kg/day in a straight line to 4 Dec 2026.");
    expect([...e.projection]).toContain("Farm Return uses this forecast only for dates up to 90 days ahead — a Farm Return planning safeguard, not a limit taken from the weights.");
    // C5's own assumption and limitations, verbatim and kept apart.
    const c5 = {
      assumptions: ["The period ADG observed in the window continues unchanged from the last period observation until the projection instant."],
      limitations: ["Simple linear extrapolation of observed ADG only; no biological, feed or seasonal model.", "A prediction is not an observation and is never used for target comparison or aggregation."],
    }; // C5 `predictWeight`'s own text
    expect([...e.assumptions]).toEqual(c5.assumptions);
    expect([...e.limitations]).toEqual(c5.limitations);
    const text = renderProfile(view, "1427");
    expect(text).toContain("SYNTH-SRC-TARGETS, version v1");
    expect(text).toContain(`Assumption: ${c5.assumptions[0]}`);
    expect(text).toContain("up to 90 days ahead");
  });

  it("8. an animal with open work has the same explanation, beside the verdict (not inside the job's Why?)", () => {
    const view = profileOf(T);
    expect(view.profile.work.open.state).toBe("ITEMS");
    const text = renderProfile(view, T);
    expect(text).toContain("Not enough weights");
    expect(text).toContain("SYNTH-SRC-TARGETS, version v1");
  });

  it("2. several targets with the same result: each explained, none dropped", () => {
    const p = profileWith((o) => {
      const a = perf1427(o);
      a.comparisons = [a.comparisons[0], { ...a.comparisons[0], targetId: "SYNTH-TARGET-SECOND" }];
    });
    const e = explanationOf(p);
    expect(e.result).toBe("On track (2 targets, each explained below)");
    expect(e.targets.map((t) => t.targetId)).toEqual(["SYNTH-TARGET-FINISHING-ADG", "SYNTH-TARGET-SECOND"]);
    // The second target has no definition in C5's register: its review state is said to be unreadable, not guessed.
    expect([...e.targets[1].lines]).toContain("The target's review state couldn't be read.");
  });

  it("3. mixed results: the headline is MIXED and each target keeps its own result", () => {
    const p = profileWith((o) => {
      const a = perf1427(o);
      a.comparisons = [a.comparisons[0], { ...a.comparisons[0], targetId: "SYNTH-TARGET-SECOND", state: "BEHIND" }];
    });
    const e = explanationOf(p);
    expect(e.result).toMatch(/^Mixed target results — /);
    expect(e.targets.map((t) => t.lines[0])).toEqual(["Result: On track", "Result: Behind target"]);
  });

  it("4, 10. conflicting target versions and an unrecorded version: said, never a source invented", () => {
    const conflict = profileWith((o) => {
      const a = perf1427(o);
      a.comparisons = [{ ...a.comparisons[0], target: null, conflictingVersions: ["v1", "v2"], state: "EVIDENCE_CONFLICT", observed: null }];
    });
    const lc = lines(conflict);
    expect(lc).toContain("Versions v1, v2 of this target disagree, so none was compared.");
    expect(lc.some((l) => l.includes("SYNTH-SRC-TARGETS"))).toBe(false);
    const unrecorded = profileWith((o) => {
      const a = perf1427(o);
      a.comparisons = [{ ...a.comparisons[0], target: null, conflictingVersions: [] }];
    });
    expect(lines(unrecorded)).toContain("Which version of this target was compared isn't recorded.");
    const noDefinition = profileWith((o) => {
      o.performance!.targetDefinitions = [];
    });
    expect(lines(noDefinition)).toContain("The target's review state couldn't be read.");
    expect(lines(noDefinition)).toContain("Target version v1 · source recorded with it: SYNTH-SRC-TARGETS, version v1"); // the compared version's own ref
  });

  // Closure audit 13552 (M1): the several-target and mixed-result cases above read the view-model only — these render
  // the real profile, open the real disclosure and check each target's own block, so dropping any target (or showing
  // the first target's provenance for all of them) fails.
  /** Two targets with distinct identity, version, source and source version; the second one's result is `second`. */
  const twoTargets = (second: "ON_TRACK" | "BEHIND") => (o: CattleOutputs) => {
    const a = perf1427(o);
    const first = a.comparisons[0];
    const sourceRef = { ...first.target!.sourceRef, sourceId: "SYNTH-SRC-SECOND", version: "v3" };
    a.comparisons = [first, { ...first, targetId: "SYNTH-TARGET-SECOND", target: { ...first.target!, id: "SYNTH-TARGET-SECOND", version: "v2", sourceRef }, metric: "WEIGHT_AT", observed: 455, targetValue: 480, lowerBound: 470, upperBound: 490, evidenceRecordIds: ["SYNTH-W-1427-1"], state: second }];
    const def = o.performance!.targetDefinitions[0];
    o.performance!.targetDefinitions = [...o.performance!.targetDefinitions, { ...def, targetId: "SYNTH-TARGET-SECOND", versions: [{ ...def.versions[0], targetId: "SYNTH-TARGET-SECOND", version: "v2", provenance: { ...def.versions[0].provenance, sourceRef } }] }];
  };
  /** The rendered block of the target whose source line is `sourceLine` — only what is visible in the open disclosure. */
  const renderedTarget = (sourceLine: string) => {
    const items = screen.getAllByText(sourceLine);
    expect(items).toHaveLength(1); // each target's provenance is shown once, under its own target
    return items[0].closest("ul")!.parentElement!.textContent ?? "";
  };
  const FIRST_SOURCE = "Target version v1 · source recorded with it: SYNTH-SRC-TARGETS, version v1";
  const SECOND_SOURCE = "Target version v2 · source recorded with it: SYNTH-SRC-SECOND, version v3";

  it("2 (rendered). several targets: every target is visible in the open disclosure with its own result, source and version", () => {
    const view = profileOf("1427");
    const text = renderProfile(view, "1427", profileWith(twoTargets("ON_TRACK")));
    expect(text).toContain("On track (2 targets, each explained below)");
    const a = renderedTarget(FIRST_SOURCE);
    expect(a).toContain("Result: On track");
    expect(a).toContain("Daily gain compared: 1.08 kg/day");
    expect(a).toContain("Review state recorded with the target: production");
    expect(a).toContain("Based on 2 weight records.");
    expect(a).not.toContain("SYNTH-SRC-SECOND");
    const b = renderedTarget(SECOND_SOURCE);
    expect(b).toContain("Result: On track");
    expect(b).toContain("Weight compared: 455 kg");
    expect(b).toContain("Review state recorded with the target: production");
    expect(b).toContain("Based on 1 weight record.");
    expect(b).not.toContain("SYNTH-SRC-TARGETS");
  });

  it("3 (rendered). mixed results: both targets' explanations are visible, each with its own result and provenance", () => {
    const view = profileOf("1427");
    const text = renderProfile(view, "1427", profileWith(twoTargets("BEHIND")));
    expect(text).toMatch(/Mixed target results — /);
    const a = renderedTarget(FIRST_SOURCE);
    expect(a).toContain("Result: On track");
    expect(a).not.toContain("Behind target");
    const b = renderedTarget(SECOND_SOURCE);
    expect(b).toContain("Result: Behind target");
    expect(b).not.toContain("Result: On track");
    expect(b).toContain("Weight compared: 455 kg");
  });

  it("6. no usable projection: no basis line and no assumptions for a weight that isn't shown", () => {
    const none = explanationOf(profileOf(T).profile); // no recent daily gain
    expect(none.projection[0]).toBe("No projection — Recent daily gain isn't known, so there's no projection.");
    expect(none.projection.some((l) => l.startsWith("Starts from"))).toBe(false);
    expect(none.assumptions).toEqual([]);
    const far = explanationOf(profileOf("1433").profile); // goal date beyond the 90-day safeguard
    expect(far.projection[0]).toMatch(/^Too far ahead to project — /);
    expect(far.projection.some((l) => l.startsWith("Starts from"))).toBe(false);
    expect([...far.projection]).toContain("Farm Return uses this forecast only for dates up to 90 days ahead — a Farm Return planning safeguard, not a limit taken from the weights.");
    expect(far.assumptions).toEqual([]);
  });

  it("performance not evaluated: the explanation says so — no target, no projection lines", () => {
    const p = profileWith((o) => {
      o.performance = null;
    });
    const e = explanationOf(p);
    expect(e.result).toBe(p.performanceState.detail ? `${p.performanceState.label} — ${p.performanceState.detail}` : p.performanceState.label);
    expect(e.targets).toEqual([]);
    expect(e.projection).toEqual([]);
    expect(e.assumptions).toEqual([]);
  });
});
