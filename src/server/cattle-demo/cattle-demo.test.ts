import { afterEach, describe, expect, it, vi } from "vitest";
import type { CattleDemoSession } from "@/components/cattle/session/demo-session";
import { parseCattleDemoSession } from "@/components/cattle/session/demo-session";
import { demoAnimalView, demoHerdView, demoProjection, isCattleDemoMode } from "./demo-service";
import { replayCattleDemo } from "./demo-replay";
import { saleWithdrawalNotice } from "@/domain/cattle/presentation";
import { animalIdOf } from "./demo-herd";

const EMPTY: CattleDemoSession = { version: 1, events: [] };
const weigh = (tag: string, kg: number, observedDate: string | null = null, eventId = "e1"): CattleDemoSession => ({ version: 1, events: [{ kind: "RECORD_WEIGHT", eventId, tag, kg, observedDate }] });
const view = (tag: string, session = EMPTY) => {
  const v = demoAnimalView(session, tag);
  if (!v) throw new Error(tag);
  return v.profile;
};

describe("C10 demonstration replay — real frozen engines, honest states", { timeout: 60_000 }, () => {
  it("1427: identity, on track against the synthetic target, a stale weight raises Record weight (C9 → Plan)", () => {
    const p = view("1427");
    expect(p.title).toBe("1427");
    expect([p.identity.breed.value, p.identity.sex.value, p.identity.age.value, p.identity.group.value, p.identity.location.value]).toEqual(["Charolais cross", "Male", "14 months", "Finishers", "Field 6"]);
    expect(p.metrics.weight).toMatchObject({ value: "521", unit: "kg" });
    expect(p.performanceState.code).toBe("TARGET:ON_TRACK");
    expect(p.work.primary).toMatchObject({ actionKind: "RECORD_WEIGHT", open: true, hardDeadline: null });
    expect(p.projection.state.code).toBe("PREDICTION:PROJECTED");
  });

  it("recording a weight now completes the linked job through the Plan kernel; a back-dated weight does not", () => {
    const after = view("1427", weigh("1427", 548));
    expect(after.metrics.weight.value).toBe("548");
    expect(after.work.primary).toBeNull();
    expect(after.work.closed.map((c) => [c.actionKind, c.completed?.label])).toEqual([["RECORD_WEIGHT", "Closed by your records"]]);
    expect(after.timeline.some((e) => e.title === "Work closed: Record weight")).toBe(true);
    expect(after.chart.points.at(-1)?.recordIds).toEqual(["SYNTH-W-SESSION-e1"]);

    const backdated = view("1427", weigh("1427", 530, "2026-10-01"));
    expect(backdated.work.primary?.actionKind).toBe("RECORD_WEIGHT");
    expect(backdated.work.primary?.completion.code).toBe("COMPLETION:NOT_STARTED");
    expect(backdated.chart.points.some((pt) => pt.recordIds.includes("SYNTH-W-SESSION-e1"))).toBe(true);
  });

  it("every edge state in the herd reaches its own display state", () => {
    expect(view("1431").performanceState.code).toBe("TARGET:AHEAD");
    expect(view("1433").performanceState.code).toBe("TARGET:BEHIND");
    const conflict = view("1438");
    expect(conflict.weight.state.code).toBe("WEIGHT:EVIDENCE_CONFLICT");
    expect(conflict.metrics.weight.value).toBeNull();
    expect(conflict.weight.candidatesKg).toEqual([498, 512]);
    expect(conflict.work.primary?.blockers[0]?.state.code).toBe("BLOCKER:UNKNOWN");
    expect(view("1440").gain.state.code).toBe("GAIN:INSUFFICIENT_EVIDENCE");
    const none = view("1442");
    expect(none.weight.state.code).toBe("WEIGHT:NONE");
    expect(none.chart.points).toEqual([]);
    expect(view("1445").goal.state.code).toBe("GOAL:NONE");
    expect(view("1445").work.primary?.actionKind).toBe("DECLARE_PRODUCTION_GOAL");
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
    expect(view("1458").work.primary?.priority.code).toBe("PRIORITY:HARD_OBLIGATION");
    expect(view("1452").work.primary?.window?.label).toMatch(/^Recommended window/);
    expect(view("1452").work.primary?.hardDeadline).toBeNull();
    expect(view("1449").identity.group.state.code).toBe("MEMBERSHIP:EVIDENCE_CONFLICT");
  });

  it("the herd lists unresolved membership in every group it might belong to, and counts per-animal work only", () => {
    const herd = demoHerdView(EMPTY);
    const finishers = herd.groups.find((g) => g.name === "Finishers")!;
    expect(finishers.unresolved.map((a) => [a.tag, a.membership.code])).toEqual([["1449", "MEMBERSHIP:EVIDENCE_CONFLICT"]]);
    expect(finishers.members.map((a) => a.tag)).not.toContain("1449");
    expect(finishers.workCounts.find((w) => w.actionKind === "RECORD_WEIGHT")?.count).toBe(3);
    expect(herd.planning.state).toBe("PLANNING_OK");
  });

  it("a malformed record fails the whole planning run closed — no jobs, an explicit failure state", () => {
    const herd = demoHerdView(EMPTY, "PLANNING_RUN_FAILURE");
    expect(herd.planning.state).toBe("PLANNING_FAILED");
    expect(herd.openWorkCount).toBe(0);
    const p = demoAnimalView(EMPTY, "1427", "PLANNING_RUN_FAILURE")!.profile;
    expect(p.work.state).toBe("PLANNING_FAILED");
    expect(p.metrics.weight.value).toBeNull();
    // The failed evaluation is unknown — never "not weighed" / "needs another weight" / "no date to project to".
    for (const s of [p.weight.state, p.gain.state, p.performanceState, p.projection.state]) expect(s.code).toBe("EVALUATION:UNAVAILABLE");
    expect(p.chart.unavailable).toBe(true);
    // Audit F005: compliance that wasn't evaluated is unavailable, not "no programmes"; the timeline names what it can't show.
    expect(p.health.programmes).toEqual({ state: "UNAVAILABLE" });
    expect(p.health.obligations).toEqual({ state: "UNAVAILABLE" });
    expect(p.recommendation.state.code).toBe("EVALUATION:UNAVAILABLE");
    expect(p.timelineGaps.join(" ")).toMatch(/weighings .*work/);
    expect(view("1427").health.programmes).toMatchObject({ state: "EVALUATED", items: [{ state: { code: "PROGRAMME:COMPLETED" } }] });
    expect(view("1427").timelineGaps).toEqual([]);
    expect(herd.groups.flatMap((g) => g.members).every((a) => a.weightState.code === "EVALUATION:UNAVAILABLE")).toBe(true);
  });

  it("an empty herd shows no animals and no work", () => {
    const herd = demoHerdView(EMPTY, "EMPTY_HERD");
    expect(herd.animalCount).toBe(0);
    expect(herd.openWorkCount).toBe(0);
  });

  it("a fractional scale reading is recorded exactly as entered (audit F007)", () => {
    const p = view("1427", weigh("1427", 548.24));
    expect(p.weight.kg).toBe(548.24);
    expect(p.chart.points.at(-1)?.kg).toBe(548.24);
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
