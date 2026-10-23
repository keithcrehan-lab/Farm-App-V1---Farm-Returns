/**
 * Cattle C10 — the availability invariant, adversarially: "C10 never collapses
 * unavailable / unknown / unresolved / failed data into a known-empty state".
 *
 * Each mutation takes the REAL frozen-engine outputs of the demonstration herd
 * and removes one owner output the way the owner fails closed (`null`,
 * `{ ok: false }`, or no entry for the animal). The view-models and the
 * rendered screens must then show that value as unavailable — and must NOT
 * show the known-empty wording the standard herd legitimately shows for the
 * same animal (zero, empty list, "none", "no animals", "nothing to do", …).
 * Every mutation first proves its forbidden wording appears in the standard
 * rendering, so a passing test can't be a vacuous one.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: vi.fn(() => new Promise(() => {})), projectCattleWeight: vi.fn(() => new Promise(() => {})), loadCattleHerd: vi.fn(() => new Promise(() => {})) }));
// The plan screen debounces its projection request; with the request pending forever the plan shows "projecting…".

import { buildAnimalProfile, buildHerd, listedItems, unseal, UNAVAILABLE_CODES, type AnimalProfileVM, type CattleOutputs, type HerdVM } from "@/domain/cattle/presentation";
import type { AnimalCostRead } from "@/domain/animal-plan";
import type { DemoAnimalView } from "@/server/cattle-demo/demo-service";
import { replayCattleDemo } from "@/server/cattle-demo/demo-replay";
import { DEMO_DIRECTORY, animalViewFrom, demoAnimalView } from "@/server/cattle-demo/demo-service";
import { AnimalPlanScreen } from "./AnimalPlanScreen";
import { animalIdOf } from "@/server/cattle-demo/demo-herd";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { GroupScreen, HerdScreen } from "./HerdScreens";
import { CattleDemoSessionProvider } from "./session/CattleDemoSessionProvider";
import type { CattleDemoSession } from "./session/demo-session";

const EMPTY: CattleDemoSession = { version: 1, events: [] };
const FINISHERS = "SYNTH-GROUP-FINISHERS";

afterEach(() => cleanup());

interface Mutation {
  name: string;
  tag: string;
  /** Removes one owner output, the way that owner fails closed. */
  mutate: (o: CattleOutputs, animalId: string) => void;
  costs?: (standard: AnimalCostRead) => AnimalCostRead;
  /** Known-empty wording: present in the standard rendering, absent once the output is unavailable. */
  forbidden: RegExp[];
  /** Unavailable wording that must appear instead. */
  required: RegExp[];
  surface: "PROFILE" | "HERD" | "PLAN";
  /** Structural view-model assertion. */
  vm: (herd: HerdVM, profile: AnimalProfileVM, plan: DemoAnimalView["plan"]) => void;
}

const isUnavailable = (a: { state: string; display?: { code: string } }) => a.state === "UNAVAILABLE" && UNAVAILABLE_CODES.includes(a.display!.code);
const rowsOf = (herd: HerdVM) => listedItems(herd.groups).flatMap((g) => (g.scope.state === "KNOWN" ? listedItems(g.scope.value.members) : []));
const rowOf = (herd: HerdVM, tag: string) => rowsOf(herd).find((r) => r.tag === tag);

const MUTATIONS: Mutation[] = [
  {
    name: "C4 group scope failed",
    tag: "1427",
    surface: "HERD",
    mutate: (o) => {
      o.groups = o.groups.map((g) => ({ ...g, scope: null }));
    },
    forbidden: [/\b\d+ animals · /, /\b0 animals\b/, /No animals are recorded in this group/, /need weighing/],
    required: [/Membership couldn't be checked/, /how many — is unknown, not zero/],
    vm: (herd) => {
      for (const g of listedItems(herd.groups)) {
        expect(isUnavailable(g.scope), g.name).toBe(true);
        expect(isUnavailable(g.workCounts), g.name).toBe(true);
        expect(g).not.toHaveProperty("memberCount");
      }
    },
  },
  {
    name: "planning run failed (herd)",
    tag: "1442",
    surface: "HERD",
    mutate: (o) => {
      o.plan = { ok: false, issues: [{ code: "CATTLE_PLAN_TEST_FAILURE", ref: null }] } as CattleOutputs["plan"];
    },
    forbidden: [/\b\d+ open jobs?\b/, /need weighing/],
    required: [/work couldn't be checked/i],
    vm: (herd) => {
      expect(isUnavailable(herd.openWorkCount)).toBe(true);
      for (const g of listedItems(herd.groups)) expect(isUnavailable(g.workCounts)).toBe(true);
      for (const r of rowsOf(herd)) expect(isUnavailable(r.nextWork), r.tag ?? "").toBe(true);
    },
  },
  {
    name: "planning run failed (animal)",
    tag: "1427",
    surface: "PROFILE",
    mutate: (o) => {
      o.plan = { ok: false, issues: [{ code: "CATTLE_PLAN_TEST_FAILURE", ref: null }] } as CattleOutputs["plan"];
    },
    forbidden: [/No open jobs for this animal/, /Nothing in the records raises work/],
    required: [/couldn't work out this animal's jobs/, /doesn't mean there's nothing to do/],
    vm: (_h, p) => expect(isUnavailable(p.work.open)).toBe(true),
  },
  {
    name: "C4 weights failed",
    tag: "1442",
    surface: "PROFILE",
    mutate: (o) => {
      o.weights = null;
    },
    forbidden: [/Not weighed yet/, /No weights recorded yet/, /nothing to chart/],
    required: [/Couldn't be read/, /chart isn't drawn/],
    vm: (_h, p) => {
      expect(p.weight).toMatchObject({ state: "UNAVAILABLE", display: { code: "EVALUATION:UNAVAILABLE" } });
      expect(isUnavailable(p.chart)).toBe(true);
    },
  },
  {
    name: "C4 series missing for the animal",
    tag: "1442",
    surface: "PROFILE",
    mutate: (o, id) => {
      if (o.weights) o.weights = { ...o.weights, series: o.weights.series.filter((s) => s.animalId !== id) };
    },
    forbidden: [/Not weighed yet/, /No weights recorded yet/],
    required: [/Couldn't be read/],
    vm: (_h, p) => {
      expect(p.weight).toMatchObject({ state: "UNAVAILABLE", display: { code: "EVALUATION:UNAVAILABLE" } });
      expect(isUnavailable(p.chart)).toBe(true);
    },
  },
  {
    name: "C5 performance failed",
    tag: "1442",
    surface: "PROFILE",
    mutate: (o) => {
      o.performance = null;
    },
    forbidden: [/No weights recorded yet/, /nothing to chart/],
    required: [/chart isn't drawn/],
    vm: (_h, p) => {
      for (const s of [p.gain.state, p.performanceState, p.projection.state, p.gain.trend]) expect(s.code).toBe("EVALUATION:UNAVAILABLE");
      expect(isUnavailable(p.chart)).toBe(true);
    },
  },
  {
    name: "C5 entry missing for the animal",
    tag: "1442",
    surface: "PROFILE",
    mutate: (o, id) => {
      if (o.performance) o.performance = { ...o.performance, animals: o.performance.animals.filter((a) => a.animalId !== id) };
    },
    forbidden: [/No weights recorded yet/, /nothing to chart/],
    required: [/chart isn't drawn/],
    vm: (_h, p) => {
      expect(p.performanceState.code).toBe("EVALUATION:UNAVAILABLE");
      expect(isUnavailable(p.chart)).toBe(true);
    },
  },
  {
    name: "C1 snapshot failed",
    tag: "1427",
    surface: "PROFILE",
    mutate: (o, id) => {
      o.snapshots = { ...o.snapshots, [id]: null };
    },
    forbidden: [/Charolais cross · Male/, /Field 6/],
    required: [/Couldn't be read · Couldn't be read · Couldn't be read/],
    vm: (_h, p) => {
      for (const f of [p.identity.breed, p.identity.sex, p.identity.age, p.identity.location, p.identity.status]) expect(f.state.code, f.label).toBe("EVALUATION:UNAVAILABLE");
      expect(p.tag.state.code).toBe("EVALUATION:UNAVAILABLE");
    },
  },
  {
    name: "C1 snapshot failed (herd row)",
    tag: "1445",
    surface: "HERD",
    mutate: (o, id) => {
      o.snapshots = { ...o.snapshots, [id]: null };
    },
    forbidden: [/Belgian Blue cross/],
    required: [/Details couldn't be read/],
    vm: (herd) => expect(rowsOf(herd).some((r) => r.subtitle === "Details couldn't be read" && r.tagState.code === "EVALUATION:UNAVAILABLE")).toBe(true),
  },
  {
    name: "C6 goals failed",
    tag: "1445",
    surface: "PROFILE",
    mutate: (o, id) => {
      o.goals = { ...o.goals, [id]: null };
    },
    forbidden: [/No goal set/],
    required: [/Couldn't be read/],
    vm: (_h, p) => expect(p.goal.state.code).toBe("EVALUATION:UNAVAILABLE"),
  },
  {
    name: "C3 health failed",
    tag: "1427",
    surface: "PROFILE",
    mutate: (o, id) => {
      o.health = { ...o.health, [id]: null };
    },
    forbidden: [/No withdrawal in force|Withdrawal clear|Clear/, /1 medicine record/],
    required: [/Health records couldn't be read/],
    vm: (_h, p) => {
      expect(isUnavailable(p.health.medicines)).toBe(true);
      expect(p.health.withdrawals[0].state.code).toBe("EVALUATION:UNAVAILABLE");
    },
  },
  {
    name: "C8 recommendations failed",
    tag: "1442",
    surface: "PROFILE",
    mutate: (o) => {
      o.recommendations = { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_TEST_FAILURE", ref: null }] } as CattleOutputs["recommendations"];
    },
    forbidden: [/Not in any declared veterinary programme/],
    required: [/Couldn't be checked/, /The evaluation didn't run, so their status is unknown/],
    vm: (_h, p) => {
      expect(isUnavailable(p.health.programmes)).toBe(true);
      expect(isUnavailable(p.health.obligations)).toBe(true);
    },
  },
  {
    name: "cost summary unavailable",
    tag: "1442",
    surface: "PROFILE",
    mutate: () => {},
    costs: () => ({ state: "UNAVAILABLE", reason: "VALUATION_DATE_UNREADABLE" }),
    forbidden: [/No costs recorded/, /No direct costs are recorded/, /Recorded direct costs/],
    required: [/Costs couldn't be read/, /costs \(couldn't be read\)/],
    vm: (_h, p) => {
      expect(p.metrics.cost.state.code).toBe("COST:UNAVAILABLE");
      expect(p.timelineGaps).toContain("costs (couldn't be read)");
    },
  },
  // The animal plan reads the same view-model: an unresolved goal, weight or housing reaches it as such.
  {
    name: "C6 goals failed (plan: no goal → goal unknown)",
    tag: "1445",
    surface: "PLAN",
    mutate: (o, id) => {
      delete o.goals[id];
    },
    forbidden: [/No goal date is declared/, /Saving declares a finishing goal for 1445\./],
    required: [/The goal couldn't be determined/, /current goal couldn't be determined/, /Unknown — the goal records couldn't be read/],
    vm: (_h, p, plan) => {
      expect(p.goal.read).toMatchObject({ state: "UNRESOLVED", display: { code: "EVALUATION:UNAVAILABLE" } });
      expect(plan.saleDateSource).toBe("The goal couldn't be determined, so the sale date is a starting suggestion.");
    },
  },
  {
    name: "C4 weights failed (plan: not weighed → couldn't be checked)",
    tag: "1442",
    surface: "PLAN",
    mutate: (o) => {
      o.weights = null;
    },
    forbidden: [/no weight recorded yet/],
    required: [/current weight couldn't be checked/],
    vm: (_h, p, plan) => {
      expect(p.weight.state).toBe("UNAVAILABLE");
      expect(unseal(plan.inputs).currentWeight).toEqual({ state: "UNKNOWN", reason: "WEIGHTS_UNAVAILABLE" });
    },
  },
  {
    name: "C1 snapshot failed (plan: housing not recorded → couldn't be checked)",
    tag: "1433",
    surface: "PLAN",
    mutate: (o, id) => {
      delete o.snapshots[id];
    },
    forbidden: [/current housing status isn't recorded/],
    required: [/current housing status couldn't be checked — the animal's record couldn't be read/],
    vm: (_h, p, plan) => {
      expect(p.identity.location.housing).toEqual({ state: "UNKNOWN", reason: "RECORD_UNAVAILABLE" });
      expect(unseal(plan.inputs).currentHousing).toEqual({ state: "UNKNOWN", reason: "RECORD_UNAVAILABLE" });
    },
  },
];

function outputsFor(tag: string, surface: Mutation["surface"]): CattleOutputs {
  const raw = surface === "HERD" ? replayCattleDemo(EMPTY) : replayCattleDemo(EMPTY, { animalIds: [animalIdOf(tag)] });
  return structuredClone(raw) as CattleOutputs; // the replay is memoised: never mutate its result
}

function renderSurface(m: Mutation, herd: HerdVM, profile: AnimalProfileVM, plan?: DemoAnimalView["plan"]): string {
  const base = demoAnimalView(EMPTY, m.tag)!;
  const text: string[] = [];
  const ui =
    m.surface === "HERD"
      ? [<HerdScreen key="h" initial={herd} scenario="STANDARD" />, <GroupScreen key="g" initial={herd} groupRef={FINISHERS} scenario="STANDARD" />]
      : m.surface === "PLAN"
        ? [<AnimalPlanScreen key="pl" initial={{ profile, plan: plan ?? base.plan }} tag={m.tag} scenario="STANDARD" />]
        : [<AnimalProfileScreen key="p" initial={{ ...base, profile }} tag={m.tag} scenario="STANDARD" />];
  for (const u of ui) {
    const { container, unmount } = render(<CattleDemoSessionProvider>{u}</CattleDemoSessionProvider>);
    text.push(container.innerText ?? container.textContent ?? "");
    // innerText is empty in jsdom; join block-level text with newlines so line anchors work.
    text.push([...container.querySelectorAll("p,span,dd,dt,div,li,h1,h2,h3,a,button")].map((e) => (e.children.length === 0 ? e.textContent : "")).filter(Boolean).join("\n"));
    unmount();
  }
  return text.join("\n");
}

function build(m: Mutation, mutated: boolean) {
  const id = animalIdOf(m.tag);
  const o = outputsFor(m.tag, m.surface);
  if (mutated) m.mutate(o, id);
  const standardCosts = unseal(demoAnimalView(EMPTY, m.tag)!.plan.inputs).costs;
  const costs = mutated && m.costs ? m.costs(standardCosts) : standardCosts;
  const view = animalViewFrom(o, id, costs);
  return { herd: buildHerd(o, DEMO_DIRECTORY), profile: buildAnimalProfile(o, id, DEMO_DIRECTORY, costs), plan: view.plan };
}

describe("C10 availability invariant — unavailable never renders as known-empty", { timeout: 120_000 }, () => {
  for (const m of MUTATIONS) {
    it(m.name, () => {
      const standard = build(m, false);
      const standardText = renderSurface(m, standard.herd, standard.profile, standard.plan);
      // Non-vacuous: at least one forbidden known-empty wording is genuinely produced by the standard herd here.
      expect(m.forbidden.some((re) => re.test(standardText)), `${m.name}: baseline shows none of ${m.forbidden.join(", ")}`).toBe(true);

      const broken = build(m, true);
      m.vm(broken.herd, broken.profile, broken.plan);
      const text = renderSurface(m, broken.herd, broken.profile, broken.plan);
      for (const re of m.forbidden) expect(text, `${m.name}: ${re}`).not.toMatch(re);
      for (const re of m.required) expect(text, `${m.name}: ${re}`).toMatch(re);
    });
  }

  it("all owner outputs missing at once: nothing anywhere reads as zero, empty or none", () => {
    const o = outputsFor("1427", "HERD");
    for (const m of MUTATIONS.filter((x) => x.surface === "HERD")) m.mutate(o, animalIdOf(m.tag));
    o.weights = null;
    o.performance = null;
    const herd = buildHerd(o, DEMO_DIRECTORY);
    expect(isUnavailable(herd.openWorkCount)).toBe(true);
    expect(listedItems(herd.groups).every((g) => isUnavailable(g.scope) && isUnavailable(g.workCounts))).toBe(true);
    const text = renderSurface({ ...MUTATIONS[0], surface: "HERD" }, herd, build(MUTATIONS[2], true).profile);
    for (const re of [/\b0 animals\b/, /\b\d+ open jobs?\b/, /No animals are recorded/, /Not weighed yet/]) expect(text).not.toMatch(re);
  });

  it("known-empty work stays known-empty: a planning run with no open jobs says nothing needs attention, never 'couldn't be checked'", () => {
    const o = outputsFor("1427", "HERD");
    o.jobs = [];
    const herd = buildHerd(o, DEMO_DIRECTORY);
    expect(herd.openWorkCount).toEqual({ state: "KNOWN", value: 0 });
    for (const g of listedItems(herd.groups)) expect(g.workCounts).toMatchObject({ state: "EMPTY", display: { code: "WORK:NONE_OPEN" } });
    const text = renderSurface({ ...MUTATIONS[0], surface: "HERD" }, herd, build(MUTATIONS[2], false).profile);
    expect(text).toMatch(/Nothing currently needs attention/);
    expect(text).toMatch(/· 0 open jobs/);
    expect(text).not.toMatch(/Work couldn't be checked/i);
  });

  it("known-empty stays known-empty: a resolved group with no animals shows 0, not 'couldn't be checked'", () => {
    const o = structuredClone(replayCattleDemo(EMPTY, { scenario: "EMPTY_HERD" })) as CattleOutputs;
    const herd = buildHerd(o, DEMO_DIRECTORY);
    expect(listedItems(herd.groups).length).toBeGreaterThan(0);
    for (const g of listedItems(herd.groups)) expect(g.scope).toMatchObject({ state: "KNOWN", value: { memberCount: 0, members: { state: "EMPTY", display: { code: "EMPTY:GROUP_ANIMALS" } }, unresolved: [] } });
    expect(rowOf(herd, "1427")).toBeUndefined();
  });

  it("every Availability in a view-model is KNOWN or carries an unavailable display state (no third shape)", () => {
    const walk = (v: unknown, path: string, out: string[]) => {
      if (v === null || typeof v !== "object") return;
      const r = v as Record<string, unknown>;
      if (r.state === "UNAVAILABLE" && "display" in r) {
        if (!UNAVAILABLE_CODES.includes((r.display as { code: string }).code)) out.push(path);
      }
      for (const [k, x] of Object.entries(r)) walk(x, `${path}.${k}`, out);
    };
    for (const m of MUTATIONS) {
      const b = build(m, true);
      const bad: string[] = [];
      walk(b.herd, "herd", bad);
      walk(b.profile, "profile", bad);
      expect(bad, m.name).toEqual([]);
    }
  });
});
