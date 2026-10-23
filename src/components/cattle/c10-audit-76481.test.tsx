/**
 * Cattle C10 — strict audit 76481 (`audit-20261023T133302Z-76481`), F001 JOB_PROVENANCE_LIFETIME: a Plan job kept
 * open across replays lost its "Why?" evidence once a later run stopped proposing the work (the explanation was
 * looked up in the latest run only). The replay now keeps each job's ORIGIN — the C9 group and the C8 record it
 * cites, bound by output id — and the explanation is built from it, with the current state said separately.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: vi.fn(() => new Promise(() => {})), projectCattleWeight: vi.fn(() => new Promise(() => {})), loadCattleHerd: vi.fn(() => new Promise(() => {})) }));

import { buildAnimalProfile, type CattleOutputs, type WorkVM } from "@/domain/cattle/presentation";
import { animalIdOf } from "@/server/cattle-demo/demo-herd";
import { jobOrigin, replayCattleDemo } from "@/server/cattle-demo/demo-replay";
import { DEMO_DIRECTORY, demoAnimalView } from "@/server/cattle-demo/demo-service";
import type { CattleDemoSession } from "./session/demo-session";
import { WorkPanel } from "./WorkPanel";

afterEach(() => cleanup());

const T = "1442"; // no weight in view: C8 raises RECORD_WEIGHT at the base run
const ID = animalIdOf(T);
const EMPTY: CattleDemoSession = { version: 1, events: [] };
const BACKDATED: CattleDemoSession = { version: 1, events: [{ kind: "RECORD_WEIGHT", eventId: "w1", tag: T, kg: 500, observedDate: "2026-10-15" }] };
const weighJob = (s: CattleDemoSession): WorkVM => {
  const p = demoAnimalView(s, T)!.profile;
  if (p.work.open.state !== "ITEMS") throw new Error(p.work.open.state);
  const w = [p.work.open.primary, ...p.work.open.others].find((x) => x.actionKind === "RECORD_WEIGHT");
  if (!w) throw new Error("no open RECORD_WEIGHT job");
  return w;
};
const tech = (w: WorkVM, label: string) => [...w.why.technical].filter((t) => t.label === label).map((t) => t.value);
const evidenceOf = (w: WorkVM) => ({ origins: [...w.why.origins], caveats: [...w.why.caveats], pack: tech(w, "Evidence pack"), source: tech(w, "Source output (C8_RECOMMENDATION)"), limitations: tech(w, "Limitation"), unknowns: tech(w, "Unknown"), raisedLabel: w.why.raised.label });

describe("F001 — an open job keeps the evidence it was raised on", { timeout: 120_000 }, () => {
  it("1. created: the job carries its C9 group and the cited C8 record; current state STILL_RAISED", () => {
    const o = replayCattleDemo(EMPTY, { animalIds: [ID] });
    const j = o.jobs.find((x) => x.job.actionKey === "CATTLE_RECOMMENDATION:RECORD_WEIGHT")!;
    expect(j.origin.recommendation.state).toBe("BOUND");
    expect(j.origin.group).not.toBeNull();
    const w = weighJob(EMPTY);
    expect(w.why.raised).toEqual({ label: "Raised 16 Oct 2026", current: "STILL_RAISED", text: null });
    expect(w.why.origins.length).toBeGreaterThan(0);
    expect(tech(w, "Evidence pack")).toHaveLength(1);
    expect(tech(w, "Limitation").length).toBeGreaterThan(0);
  });

  it("2. the auditor's case — a back-dated weight: still open, same evidence as when raised, said no longer raised", () => {
    const before = weighJob(EMPTY);
    const after = weighJob(BACKDATED);
    expect(after.status.label).toBe("To do");
    expect(evidenceOf(after)).toEqual(evidenceOf(before));
    // …and that evidence is really there (not two empty explanations that happen to match).
    expect(evidenceOf(after).pack).toHaveLength(1);
    expect(evidenceOf(after).source).toHaveLength(1);
    expect(evidenceOf(after).origins.length).toBeGreaterThan(0);
    expect(evidenceOf(after).limitations.length).toBeGreaterThan(0);
    expect(after.why.raised).toEqual({
      label: "Raised 16 Oct 2026",
      current: "NO_LONGER_RAISED",
      text: "That was the reason when it was raised. The latest records no longer raise it on their own; it stays open until it's done as described below.",
    });
    expect(after.why.completionRule).toMatch(/An earlier, back-dated weight doesn't close it\./);
    // The latest run really no longer proposes it (the origin, not the latest run, carries the evidence).
    const o = replayCattleDemo(BACKDATED, { animalIds: [ID] });
    expect(o.plan.ok && o.plan.result.groups.some((g) => g.identityKey.includes("RECORD_WEIGHT") && g.identityKey.includes(ID))).toBe(false);
    // Rendered: the note is on the work card.
    const p = demoAnimalView(BACKDATED, T)!.profile;
    const { container } = render(<WorkPanel work={p.work} onRecordWeight={null} resolvedTitles={[]} />);
    expect(container.textContent).toContain("The latest records no longer raise it on their own");
  });

  it("3. repeated replay: further actions never change the job's original evidence", () => {
    const first = evidenceOf(weighJob(BACKDATED));
    const more: CattleDemoSession = { version: 1, events: [...BACKDATED.events, { kind: "RECORD_WEIGHT", eventId: "w2", tag: T, kg: 498, observedDate: "2026-10-14" }, { kind: "SAVE_PLAN_GOAL", eventId: "g1", tag: T, goalType: "FINISHING", targetKg: 620, targetDate: "2027-01-10" }] };
    expect(first.pack).toHaveLength(1);
    expect(evidenceOf(weighJob(more))).toEqual(first);
    expect(evidenceOf(weighJob(more))).toEqual(evidenceOf(weighJob(more))); // deterministic
  });

  it("4. evidence not kept is said to be unavailable — never borrowed from the latest run", () => {
    const o = structuredClone(replayCattleDemo(EMPTY, { animalIds: [ID] })) as CattleOutputs;
    const idx = o.jobs.findIndex((x) => x.job.actionKey === "CATTLE_RECOMMENDATION:RECORD_WEIGHT");
    const read = (out: CattleOutputs) => {
      const p = buildAnimalProfile(out, ID, DEMO_DIRECTORY, { state: "UNAVAILABLE" } as never);
      if (p.work.open.state !== "ITEMS") throw new Error(p.work.open.state);
      return [p.work.open.primary, ...p.work.open.others].find((x) => x.actionKind === "RECORD_WEIGHT")!;
    };
    // The latest run still proposes it and its C8 record is readable — yet nothing is taken from there.
    o.jobs[idx] = { ...o.jobs[idx], origin: null };
    const none = read(o);
    expect(none.why.origins).toEqual([]);
    expect(tech(none, "Evidence pack")).toEqual([]);
    expect([...none.why.caveats]).toContain("The evidence this job was raised on wasn't kept, so it isn't shown.");
    expect(none.why.raised.label).toBe("When this was raised isn't recorded");
    const kept = structuredClone(replayCattleDemo(EMPTY, { animalIds: [ID] })) as CattleOutputs;
    kept.jobs[idx] = { ...kept.jobs[idx], origin: { ...kept.jobs[idx].origin!, recommendation: { state: "UNAVAILABLE" } } };
    const unread = read(kept);
    expect(tech(unread, "Evidence pack")).toEqual([]);
    expect([...unread.why.caveats]).toContain("The recommendation record behind this job couldn't be read when it was raised, so its evidence and assumptions aren't shown.");
  });

  it("5. binding: only the C8 record whose pack id is the group's cited output; else UNAVAILABLE; programme/requirement work is NOT_C8", () => {
    const o = replayCattleDemo(EMPTY, { animalIds: [ID] });
    if (!o.plan.ok || !o.recommendations.ok) throw new Error("fixture");
    const r = o.plan.result;
    const job = o.jobs.find((x) => x.job.actionKey === "CATTLE_RECOMMENDATION:RECORD_WEIGHT")!.job;
    const c8 = o.recommendations;
    expect(jobOrigin(r, job, "2026-10-16T09:00:00Z", () => c8).recommendation.state).toBe("BOUND");
    // Same kind of record, different output id: never bound.
    const other = structuredClone(c8);
    for (const a of other.result.animals) if (a.record) a.record.packId = `${a.record.packId}-OTHER`;
    expect(jobOrigin(r, job, "2026-10-16T09:00:00Z", () => other).recommendation).toEqual({ state: "UNAVAILABLE" });
    expect(jobOrigin(r, job, "2026-10-16T09:00:00Z", () => ({ ok: false, issues: [] }) as never).recommendation).toEqual({ state: "UNAVAILABLE" });
    // Across the whole herd: a job is BOUND exactly when its own group cites a C8 output (an item or a folded
    // restatement — e.g. 1458's requirement folds C8's RESOLVE_OBLIGATION_EVIDENCE), and then to that output only.
    const herd = replayCattleDemo(EMPTY);
    const states = new Set<string>();
    for (const j of herd.jobs) {
      const cited = new Set((j.origin.group?.items ?? []).flatMap((i) => [...(i.family === "C8_RECOMMENDATION" ? [i.outputId] : []), ...i.supporting.map((x) => x.outputId)]));
      states.add(j.origin.recommendation.state);
      if (cited.size === 0) expect(j.origin.recommendation, j.job.id).toEqual({ state: "NOT_C8" });
      else {
        expect(j.origin.recommendation.state, j.job.id).toBe("BOUND");
        if (j.origin.recommendation.state === "BOUND") expect(cited.has(j.origin.recommendation.record.packId), j.job.id).toBe(true);
      }
    }
    expect(states).toEqual(new Set(["BOUND"])); // every demo job cites C8 (C8 restates programmes and requirements)
    // A group citing no C8 output (its C8 items and folded restatements removed) is NOT_C8 — C8 is never consulted.
    if (!herd.plan.ok) throw new Error("herd plan");
    const hr = herd.plan.result;
    const group = hr.groups.find((g) => g.items.some((i) => i.family !== "C8_RECOMMENDATION"))!;
    const owner = herd.jobs.find((j) => j.origin.group?.identityKey === group.identityKey)!;
    const bare = { ...hr, groups: hr.groups.map((g) => (g === group ? { ...g, items: g.items.filter((i) => i.family !== "C8_RECOMMENDATION").map((i) => ({ ...i, supporting: [] })) } : g)) };
    const c8Run = vi.fn(() => c8);
    expect(jobOrigin(bare, owner.job, "2026-10-16T09:00:00Z", c8Run).recommendation).toEqual({ state: "NOT_C8" });
    expect(c8Run).not.toHaveBeenCalled();
  });
});
