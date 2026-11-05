import { describe, expect, it, vi } from "vitest";

/**
 * Manage herd's read-only group context: individual counts and weighings from the real cattle evaluation, the current
 * field from the open grazing session, and the production target from `cattle_group_production_plans` — each source
 * failing closed to an honest unavailable / not-recorded state.
 */

vi.mock("@/server/cattle-real/real-service", async (importOriginal) => ({ ...(await importOriginal<typeof import("./real-service")>()), loadRealCattle: vi.fn() }));
vi.mock("@/server/cattle-real/operational-view", () => ({ loadCattleOperationalView: vi.fn() }));

import type { LivestockGroup } from "@/domain/types";
import type { LivestockIndividualRow, WeightObservationRow } from "@/lib/farm-data/row-types";
import { deriveCattleGroupProductionPlanMetrics } from "@/domain/cattle-group-production-plan";
import { evaluateRealCattle, loadRealCattle, type RealEvaluation } from "./real-service";
import { loadCattleOperationalView, type CattleOperationalView } from "./operational-view";
import { loadManageHerdContext, manageHerdContextOf } from "./manage-herd-view";

const FARM = "f0000000-0000-4000-8000-0000000000d1";
const G_ANIMALS = "6d000000-0000-4000-8000-000000000001";
const G_HEAD = "6d000000-0000-4000-8000-000000000002";
const A1 = "ad000000-0000-4000-8000-000000000001";
const VP = { effectiveAt: "2026-11-05T10:00:00Z", knowledgeCutoff: "2026-11-05T10:00:00Z" };

const group = (id: string, label: string, head: number, avg?: number): LivestockGroup => ({
  id,
  farmId: FARM,
  category: "steer",
  label,
  count: { value: head, status: "verified", source: "Farmer" },
  ...(avg ? { avgWeightKg: { value: avg, status: "farmer_adjusted" as const, source: "Farmer" } } : {}),
  system: "grazing",
  value: { value: 0, status: "estimated", source: "Farm Return assumption" },
});
const animal: LivestockIndividualRow = {
  id: A1, farm_id: FARM, group_id: G_ANIMALS, tag_number: "IE 1", category: "steer", sex: "male", breed: null,
  date_of_birth: null, goal_status: null, notes: null, created_at: "2026-07-01T08:30:00+00:00", updated_at: "2026-07-01T08:30:00+00:00",
};
const weight: WeightObservationRow = {
  id: "cd000000-0000-4000-8000-000000000001", farm_id: FARM, animal_id: A1, weight_kg: 480, observed_date: "2026-10-20",
  source: null as never, created_at: "2026-10-20T19:00:00+00:00",
};
const groups = [group(G_ANIMALS, "Bullocks", 3, 450), group(G_HEAD, "Sucklers", 40)];

function evaluation(): RealEvaluation {
  const r = evaluateRealCattle({ farmId: FARM, groups, animals: [animal], weights: [weight] }, VP);
  if (!r.ok) throw new Error(r.reason);
  return r.evaluation;
}

function operational(): CattleOperationalView {
  const plan = { groupId: G_ANIMALS, farmId: FARM, targetWeightKg: 650, targetDate: "2027-03-05" };
  return {
    state: "OK",
    fields: [{ id: "field-1", name: "Long Acre", areaHa: 4 }],
    groups: [
      {
        groupId: G_ANIMALS, category: "steer", system: "grazing", headCount: 3, averageWeightKg: 450, averageWeightSource: "Farmer",
        currentField: { id: "field-1", name: "Long Acre", since: "2026-10-01T09:00:00+00:00" },
        productionPlan: plan,
        productionMetrics: deriveCattleGroupProductionPlanMetrics({ plan, currentWeightKg: 450, headCount: 3, asOfDate: "2026-11-05" }),
      },
      { groupId: G_HEAD, category: "steer", system: "grazing", headCount: 40, productionMetrics: deriveCattleGroupProductionPlanMetrics({ headCount: 40, asOfDate: "2026-11-05" }) },
    ],
  };
}

describe("manageHerdContextOf", () => {
  it("reads individual counts, the current field, the latest weighing and the production plan from their own records", () => {
    const ctx = manageHerdContextOf([G_ANIMALS, G_HEAD], evaluation(), operational());
    expect(ctx.state).toBe("OK");
    const g = ctx.groups[G_ANIMALS];
    expect(g.individuals).toBe(1);
    expect(g.headcountNote).toMatch(/group record holds 3 head, but 1 animal is recorded individually/);
    expect(g.currentField).toEqual({ state: "KNOWN", value: "Long Acre", detail: "Since 1 Oct 2026 · from the latest field movement" });
    expect(g.latestIndividualWeight).toMatchObject({ state: "KNOWN", value: "480 kg" });
    expect(g.production.hasTarget).toBe(true);
    expect(g.production.target).toMatchObject({ state: "KNOWN", value: "650 kg by 5 Mar 2027" });
    // (650 − 450) / 120 days, via the existing deriveCattleGroupProductionPlanMetrics path.
    expect(g.production.requiredAdg).toMatchObject({ state: "KNOWN", value: "1.67 kg/day" });
  });

  it("a headcount-only group has no individuals, no field and no target — said, never invented", () => {
    const g = manageHerdContextOf([G_ANIMALS, G_HEAD], evaluation(), operational()).groups[G_HEAD];
    expect(g.individuals).toBe(0);
    expect(g.headcountNote).toBeNull();
    expect(g.currentField.state).toBe("NOT_RECORDED");
    expect(g.latestIndividualWeight.state).toBe("NOT_RECORDED");
    expect(g.production).toMatchObject({ hasTarget: false, target: { state: "NOT_RECORDED" } });
  });

  it("an unreadable source is UNAVAILABLE for its facts only", () => {
    const noOps = manageHerdContextOf([G_ANIMALS], evaluation(), { state: "UNAVAILABLE", fields: [], groups: [] });
    expect(noOps.state).toBe("PARTIAL");
    expect(noOps.groups[G_ANIMALS].individuals).toBe(1);
    expect(noOps.groups[G_ANIMALS].currentField.state).toBe("UNAVAILABLE");
    expect(noOps.groups[G_ANIMALS].production.target.state).toBe("UNAVAILABLE");

    const noAnimals = manageHerdContextOf([G_ANIMALS], null, operational());
    expect(noAnimals.groups[G_ANIMALS].individuals).toBeNull();
    expect(noAnimals.groups[G_ANIMALS].latestIndividualWeight.state).toBe("UNAVAILABLE");
    expect(noAnimals.groups[G_ANIMALS].currentField.state).toBe("KNOWN");

    expect(manageHerdContextOf([G_ANIMALS], null, null).state).toBe("UNAVAILABLE");
  });
});

describe("loadManageHerdContext", () => {
  it("fails closed when the cattle records can't be read or a loader throws", async () => {
    vi.mocked(loadRealCattle).mockResolvedValueOnce({ state: "UNAVAILABLE" });
    expect(await loadManageHerdContext()).toEqual({ state: "UNAVAILABLE", groups: {} });

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadRealCattle).mockResolvedValueOnce({ state: "OK", evaluation: evaluation() });
    vi.mocked(loadCattleOperationalView).mockRejectedValueOnce(new Error("boom"));
    expect(await loadManageHerdContext()).toEqual({ state: "UNAVAILABLE", groups: {} });
  });

  it("loads the operational view for the evaluated farm's own groups", async () => {
    vi.mocked(loadRealCattle).mockResolvedValueOnce({ state: "OK", evaluation: evaluation() });
    vi.mocked(loadCattleOperationalView).mockResolvedValueOnce(operational());
    const ctx = await loadManageHerdContext();
    expect(vi.mocked(loadCattleOperationalView)).toHaveBeenLastCalledWith(FARM, expect.arrayContaining([expect.objectContaining({ id: G_HEAD })]), "2026-11-05");
    expect(Object.keys(ctx.groups).sort()).toEqual([G_ANIMALS, G_HEAD].sort());
  });
});
