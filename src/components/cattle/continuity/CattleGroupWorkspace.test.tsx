import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCattleOperationsVM,
  cattleGroupOperationsFor,
} from "@/domain/cattle/presentation";
import { deriveCattleGroupProductionPlanMetrics } from "@/domain/cattle-group-production-plan";
import { CattleGroupWorkspace } from "./CattleGroupWorkspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/grazing-field-movements", () => ({ moveLivestockGroupToFieldAction: vi.fn() }));
vi.mock("@/app/actions/cattle-group-production-plan", () => ({ saveCattleGroupProductionPlanAction: vi.fn() }));

afterEach(cleanup);

describe("CattleGroupWorkspace", () => {
  it("connects location, target performance, grass demand and cost without inventing market or medicine evidence", () => {
    const plan = {
      groupId: "group-1",
      farmId: "farm-1",
      targetWeightKg: 500,
      targetDate: "2027-02-12",
      concentrateKgHeadDay: 2,
      concentratePriceEurT: 400,
      forageCostEurHeadDay: 0.6,
      housingCostEurHeadDay: 0.2,
    };
    const metrics = deriveCattleGroupProductionPlanMetrics({
      plan,
      currentWeightKg: 420,
      headCount: 20,
      asOfDate: "2026-11-04",
    });
    const operations = buildCattleOperationsVM({
      state: "OK",
      fields: [{ id: "field-1", name: "P. Collins" }],
      groups: [{
        groupId: "group-1",
        category: "weanling",
        goal: "grow",
        headCount: 20,
        averageWeightKg: 420,
        averageWeightSource: "Farmer group estimate",
        currentField: { id: "field-1", name: "P. Collins", since: "2026-11-02T00:00:00.000Z" },
        productionPlan: plan,
        productionMetrics: metrics,
        grazingDemand: {
          status: "resolved",
          provider: "beef_liveweight_v1",
          groupId: "group-1",
          category: "weanling",
          headCount: 20,
          kgDmPerHeadDay: 8.4,
          dailyDemandKgDm: 168,
          confidence: "medium",
          source: "Teagasc beef grazing guidance",
          ruleId: "TEAGASC_BEEF_GRAZING_2PCT_LW",
          evidence: [],
        },
      }],
    }, "2026-11-04");

    render(
      <CattleGroupWorkspace
        vm={cattleGroupOperationsFor(operations, "group-1")}
        asOfDate="2026-11-04"
        workLabel="No open weighing work"
        workDetail="Other work not inferred"
      />,
    );

    expect(screen.getByText("P. Collins")).toBeInTheDocument();
    expect(screen.getByText("168")).toBeInTheDocument();
    expect(screen.getByText("kg DM/day")).toBeInTheDocument();
    expect(screen.getByText("0.80")).toBeInTheDocument();
    expect(screen.getByText("€1.60")).toBeInTheDocument();
    expect(screen.getByText("/head/day")).toBeInTheDocument();
    expect(screen.getByText(/waiting for a validated value-of-gain series/i)).toBeInTheDocument();
    expect(screen.getByText(/medicine records are awaiting a production data source/i)).toBeInTheDocument();
    expect(screen.getByText(/live valuation is awaiting an approved price source/i)).toBeInTheDocument();
    expect(screen.queryByText(/economic optimum:/i)).toBeNull();
  });
});
