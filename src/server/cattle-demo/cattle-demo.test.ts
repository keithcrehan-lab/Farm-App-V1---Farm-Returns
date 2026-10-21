import { afterEach, describe, expect, it, vi } from "vitest";
import type { CattleDemoSession } from "@/components/cattle/session/demo-session";
import { parseCattleDemoSession } from "@/components/cattle/session/demo-session";
import { demoAnimalView, demoHerdView, demoProjection, isCattleDemoMode } from "./demo-service";
import { replayCattleDemo } from "./demo-replay";
import { saleWithdrawalNotice } from "@/domain/cattle/presentation";
import { animalIdOf } from "./demo-herd";
import { DEMO_ACTION_REGISTRY } from "./demo-catalogue";
import { DEFAULT_CANDIDATE_ACTION_REGISTRY } from "@/domain/cattle/recommendations";

const EMPTY: CattleDemoSession = { version: 1, events: [] };
const weigh = (tag: string, kg: number, observedDate: string | null = null, eventId = "e1"): CattleDemoSession => ({ version: 1, events: [{ kind: "RECORD_WEIGHT", eventId, tag, kg, observedDate }] });
const view = (tag: string, session = EMPTY) => {
  const v = demoAnimalView(session, tag);
  if (!v) throw new Error(tag);
  return v.profile;
};
type Profile = ReturnType<typeof view>;
const openWork = (p: Profile) => (p.work.open.state === "KNOWN" ? p.work.open.value : null);
const primary = (p: Profile) => openWork(p)?.primary;
const points = (p: Profile) => (p.chart.state === "KNOWN" ? p.chart.value.points : null);

describe("C10 demonstration replay — real frozen engines, honest states", { timeout: 60_000 }, () => {
  it("1427: identity, on track against the synthetic target; an old weight raises no work (no C10 staleness rule)", () => {
    const p = view("1427");
    expect(p.title).toBe("1427");
    expect([p.identity.breed.value, p.identity.sex.value, p.identity.age.value, p.identity.group.value, p.identity.location.value]).toEqual(["Charolais cross", "Male", "14 months", "Finishers", "Field 6"]);
    expect(p.metrics.weight).toMatchObject({ value: "521", unit: "kg" });
    expect(p.performanceState.code).toBe("TARGET:ON_TRACK");
    // Decision 4: the latest weight (14 Sep) is 32 days old, but the frozen default registry ships no staleness interval.
    expect(p.weight.observedAt?.slice(0, 19)).toBe("2026-09-14T10:00:00");
    expect(openWork(p)).toEqual({ primary: null, others: [] });
    expect(p.projection.state.code).toBe("PREDICTION:PROJECTED");
  });

  it("the demonstration runs the frozen default action registry unchanged (no weight-staleness interval)", () => {
    expect(DEMO_ACTION_REGISTRY).toBe(DEFAULT_CANDIDATE_ACTION_REGISTRY);
    const recordWeight = DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.find((d) => d.actionKind === "RECORD_WEIGHT");
    expect(recordWeight?.trigger).toMatchObject({ kind: "WEIGHT_MISSING_OR_STALE", staleAfter: null });
    // RECORD_WEIGHT only where no usable weight is in view: 1442 (none) and 1438 (readings conflict).
    const herd = demoHerdView(EMPTY);
    const weighing = herd.groups.flatMap((g) => (g.scope.state === "KNOWN" ? g.scope.value.members : [])).filter((a) => a.nextWork.state === "KNOWN" && a.nextWork.value?.title === "Record weight");
    expect(weighing.map((a) => a.tag).sort()).toEqual(["1438", "1442"]);
  });

  it("recording a weight now completes the linked job through the Plan kernel; a back-dated weight does not", () => {
    expect(primary(view("1442"))?.actionKind).toBe("RECORD_WEIGHT");
    const after = view("1442", weigh("1442", 400));
    expect(after.metrics.weight.value).toBe("400");
    expect(primary(after)).toBeNull();
    expect(after.work.closed.map((c) => [c.actionKind, c.completed?.label])).toEqual([["RECORD_WEIGHT", "Closed by your records"]]);
    expect(after.timeline.some((e) => e.title === "Work closed: Record weight")).toBe(true);
    expect(points(after)?.at(-1)?.recordIds).toEqual(["SYNTH-W-SESSION-e1"]);

    const backdated = view("1442", weigh("1442", 400, "2026-10-01"));
    expect(primary(backdated)?.actionKind).toBe("RECORD_WEIGHT");
    expect(primary(backdated)?.completion.code).toBe("COMPLETION:NOT_STARTED");
    expect(points(backdated)?.some((pt) => pt.recordIds.includes("SYNTH-W-SESSION-e1"))).toBe(true);
  });

  it("every edge state in the herd reaches its own display state", () => {
    expect(view("1431").performanceState.code).toBe("TARGET:AHEAD");
    expect(view("1433").performanceState.code).toBe("TARGET:BEHIND");
    const conflict = view("1438");
    expect(conflict.weight.state.code).toBe("WEIGHT:EVIDENCE_CONFLICT");
    expect(conflict.metrics.weight.value).toBeNull();
    expect(conflict.weight.candidatesKg).toEqual([498, 512]);
    expect(primary(conflict)?.blockers[0]?.state.code).toBe("BLOCKER:UNKNOWN");
    expect(view("1440").gain.state.code).toBe("GAIN:INSUFFICIENT_EVIDENCE");
    const none = view("1442");
    expect(none.weight.state.code).toBe("WEIGHT:NONE");
    expect(none.chart).toMatchObject({ state: "KNOWN", value: { points: [] } }); // C5 ran: a known-empty series
    expect(view("1445").goal.state.code).toBe("GOAL:NONE");
    expect(primary(view("1445"))?.actionKind).toBe("DECLARE_PRODUCTION_GOAL");
    const withdrawal = view("1447");
    expect(withdrawal.health.withdrawal.state.code).toBe("WITHDRAWAL:IN_WITHDRAWAL");
    expect(withdrawal.health.withdrawal.untilLabel).toMatch(/^Until 30 Oct 2026/);
    expect(withdrawal.recommendation.state.code).toBe("RECOMMENDATION:NO_RECOMMENDATION");
    // The plan reads the same C3 end against a chosen sale date: inside (incl. the end day) → notice; after → none.
    expect(saleWithdrawalNotice(withdrawal.health.withdrawal, "2026-10-25")?.tone).toBe("risk");
    expect(saleWithdrawalNotice(withdrawal.health.withdrawal, "2026-10-30")?.tone).toBe("risk");
    expect(saleWithdrawalNotice(withdrawal.health.withdrawal, "2026-10-31")).toBeNull();
    expect(saleWithdrawalNotice(view("1427").health.withdrawal, "2026-10-25")).toBeNull();
    const unknownWithdrawal = view("1455");
    expect(unknownWithdrawal.health.withdrawal.state.code).toBe("WITHDRAWAL:UNKNOWN");
    expect(unknownWithdrawal.health.withdrawal.state.tone).toBe("unknown");
    expect(saleWithdrawalNotice(unknownWithdrawal.health.withdrawal, "2027-06-01")?.tone).toBe("unknown");
    expect(primary(view("1458"))?.priority.code).toBe("PRIORITY:HARD_OBLIGATION");
    expect(primary(view("1452"))?.window?.label).toMatch(/^Recommended window/);
    expect(primary(view("1452"))?.hardDeadline).toBeNull();
    // No location recorded: C1 location UNKNOWN, so the plan's observed housing is unknown (never "outdoors").
    const unrecorded = demoAnimalView(EMPTY, "1433")!;
    expect(unrecorded.profile.identity.location.state.code).toBe("IDENTITY:UNKNOWN");
    expect(unrecorded.plan.currentlyHoused).toBeNull();
    expect(unrecorded.plan.defaults.assumedCurrentHousing).toBeNull();
    expect(view("1449").identity.group.state.code).toBe("MEMBERSHIP:EVIDENCE_CONFLICT");
  });

  it("the herd lists unresolved membership in every group it might belong to, and counts per-animal work only", () => {
    const herd = demoHerdView(EMPTY);
    const finishers = herd.groups.find((g) => g.name === "Finishers")!;
    if (finishers.scope.state !== "KNOWN" || finishers.workCounts.state !== "KNOWN") throw new Error("scope");
    expect(finishers.scope.value.unresolved.map((a) => [a.tag, a.membership.code])).toEqual([["1449", "MEMBERSHIP:EVIDENCE_CONFLICT"]]);
    expect(finishers.scope.value.members.map((a) => a.tag)).not.toContain("1449");
    expect(finishers.workCounts.value.find((w) => w.actionKind === "RECORD_WEIGHT")?.count).toBe(2);
    expect(herd.planning.state).toBe("PLANNING_OK");
  });

  it("a malformed record fails the whole planning run closed — no jobs, an explicit failure state", () => {
    const herd = demoHerdView(EMPTY, "PLANNING_RUN_FAILURE");
    expect(herd.planning.state).toBe("PLANNING_FAILED");
    expect(herd.openWorkCount).toMatchObject({ state: "UNAVAILABLE", display: { code: "PLANNING:UNAVAILABLE" } });
    const p = demoAnimalView(EMPTY, "1427", "PLANNING_RUN_FAILURE")!.profile;
    expect(p.work.open).toMatchObject({ state: "UNAVAILABLE", display: { code: "PLANNING:UNAVAILABLE" } });
    expect(p.metrics.weight.value).toBeNull();
    // The failed evaluation is unknown — never "not weighed" / "needs another weight" / "no date to project to".
    for (const s of [p.weight.state, p.gain.state, p.performanceState, p.projection.state]) expect(s.code).toBe("EVALUATION:UNAVAILABLE");
    expect(p.chart.state).toBe("UNAVAILABLE");
    // Audit F005: compliance that wasn't evaluated is unavailable, not "no programmes"; the timeline names what it can't show.
    expect(p.health.programmes).toMatchObject({ state: "UNAVAILABLE" });
    expect(p.health.obligations).toMatchObject({ state: "UNAVAILABLE" });
    expect(p.recommendation.state.code).toBe("EVALUATION:UNAVAILABLE");
    expect(p.timelineGaps.join(" ")).toMatch(/weighings .*work/);
    expect(view("1427").health.programmes).toMatchObject({ state: "KNOWN", value: [{ state: { code: "PROGRAMME:COMPLETED" } }] });
    expect(view("1427").timelineGaps).toEqual([]);
    const rows = herd.groups.flatMap((g) => (g.scope.state === "KNOWN" ? g.scope.value.members : []));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((a) => a.weightState.code === "EVALUATION:UNAVAILABLE" && a.nextWork.state === "UNAVAILABLE")).toBe(true);
    expect(herd.groups.every((g) => g.workCounts.state === "UNAVAILABLE")).toBe(true);
  });

  it("an empty herd: groups are known-empty (0 animals); work is whatever the planning run said — here it was rejected, so unavailable, never \"0 jobs\"", () => {
    const herd = demoHerdView(EMPTY, "EMPTY_HERD");
    expect(herd.animalCount).toBe(0);
    expect(herd.groups.every((g) => g.scope.state === "KNOWN" && g.scope.value.memberCount === 0)).toBe(true);
    expect(herd.planning.state).toBe("PLANNING_FAILED");
    expect(herd.openWorkCount.state).toBe("UNAVAILABLE");
  });

  it("a fractional scale reading is recorded exactly as entered (audit F007)", () => {
    const p = view("1427", weigh("1427", 548.24));
    expect(p.weight.kg).toBe(548.24);
    expect(points(p)?.at(-1)?.kg).toBe(548.24);
  });

  it("saving a plan declares a new C6 goal version (sale date and target weight)", () => {
    const s: CattleDemoSession = { version: 1, events: [{ kind: "SAVE_PLAN_GOAL", eventId: "g1", tag: "1427", goalType: "FINISHING", targetKg: 620, targetDate: "2026-11-20" }] };
    const p = view("1427", s);
    expect(p.goal).toMatchObject({ targetWeightKg: 620, targetDate: "2026-11-20" });
    expect(p.timeline.some((e) => e.title === "Goal updated: Finishing" && e.infoClass === "INTENT")).toBe(true);
  });

  it("the projection comes from C5 alone and is the same whatever the plan's feed inputs (it never sees them)", () => {
    const a = demoProjection(EMPTY, "1427", "2026-12-04");
    expect(a.state).toBe("PROJECTED");
    if (a.state === "PROJECTED") {
      expect(a.kg).toBeCloseTo(521 + a.adgKgPerDay * ((Date.parse("2026-12-04T12:00:00Z") - Date.parse("2026-09-14T10:00:00Z")) / 86_400_000), 9);
      expect(a.assumptions[0]).toMatch(/continues unchanged/);
    }
    expect(demoProjection(EMPTY, "1442", "2026-12-04").state).toBe("NOT_PROJECTED");
    expect(demoProjection(EMPTY, "1427", "2026-10-01")).toMatchObject({ state: "NOT_PROJECTED", reason: "SALE_DATE_NOT_AFTER_TODAY" });
  });

  it("valuations come from the labelled fixture provider and are never live", () => {
    const v = demoAnimalView(EMPTY, "1427")!.plan.valuations;
    expect(v["SYNTH-MART-BLESSINGTON"]).toMatchObject({ state: "ESTIMATED", reportDate: "2026-10-16", provider: { kind: "DEVELOPMENT_FIXTURE", isLive: false }, estimateDerivation: "DERIVED_FROM_PER_KG_AND_LIVEWEIGHT" });
    expect(v["SYNTH-MART-STALE"].freshness?.state).toBe("STALE");
    expect(demoAnimalView(EMPTY, "1442")!.plan.valuations["SYNTH-MART-BLESSINGTON"].state).toBe("NO_COMPARABLE");
  });

  it("the replay is deterministic and holds no state", () => {
    const a = replayCattleDemo(weigh("1427", 548), { animalIds: [animalIdOf("1427")] });
    const b = replayCattleDemo(structuredClone(weigh("1427", 548)), { animalIds: [animalIdOf("1427")] });
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    expect(view("1427").metrics.weight.value).toBe("521");
  });
});

describe("C10 trust boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("demonstration mode only when Supabase is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(isCattleDemoMode()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isCattleDemoMode()).toBe(true);
  });

  it("server actions refuse in real-account mode and reject malformed sessions", async () => {
    const actions = await import("@/app/(app)/cattle/actions");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(await actions.loadCattleHerd(EMPTY, "STANDARD")).toEqual({ ok: false, reason: "REAL_ACCOUNT_MODE" });
    expect(await actions.loadCattleAnimal(EMPTY, "1427", "STANDARD")).toEqual({ ok: false, reason: "REAL_ACCOUNT_MODE" });
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await actions.loadCattleHerd({ version: 1, events: [{ kind: "RECORD_WEIGHT", eventId: "x", tag: "1427", kg: -4, observedDate: null }] }, "STANDARD")).toEqual({ ok: false, reason: "INVALID_REQUEST" });
    expect(await actions.loadCattleAnimal(EMPTY, "9999", "STANDARD")).toEqual({ ok: false, reason: "UNKNOWN_ANIMAL" });
    expect(await actions.projectCattleWeight(EMPTY, "1427", "2026-02-30", "STANDARD")).toEqual({ ok: false, reason: "INVALID_REQUEST" });
    expect(await actions.loadCattleHerd(EMPTY, "SOMETHING")).toEqual({ ok: false, reason: "INVALID_REQUEST" });
  });

  it("the session parser rejects extra fields, duplicates, oversize sessions and impossible dates", () => {
    expect(parseCattleDemoSession({ version: 1, events: [], extra: 1 }).ok).toBe(false);
    expect(parseCattleDemoSession({ version: 1, events: [{ kind: "RECORD_WEIGHT", eventId: "a", tag: "1427", kg: 500, observedDate: "2026-02-30" }] }).ok).toBe(false);
    const ev = { kind: "RECORD_WEIGHT", eventId: "a", tag: "1427", kg: 500, observedDate: null };
    expect(parseCattleDemoSession({ version: 1, events: [ev, ev] })).toEqual({ ok: false, reason: "CATTLE_DEMO_SESSION_DUPLICATE_EVENT" });
    expect(parseCattleDemoSession({ version: 1, events: Array.from({ length: 41 }, (_, i) => ({ ...ev, eventId: `e${i}` })) }).ok).toBe(false);
  });
});
