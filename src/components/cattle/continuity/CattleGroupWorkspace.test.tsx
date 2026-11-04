import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCattleOperationsVM,
  cattleGroupOperationsFor,
} from "@/domain/cattle/presentation";
import { deriveCattleGroupProductionPlanMetrics, type CattleGroupProductionPlan } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import { CattleGroupWorkspace } from "./CattleGroupWorkspace";

const save = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/grazing-field-movements", () => ({ moveLivestockGroupToFieldAction: vi.fn() }));
vi.mock("@/app/actions/cattle-group-production-plan", () => ({ saveCattleGroupProductionPlanAction: (...args: unknown[]) => save(...args) }));

afterEach(() => {
  cleanup();
  save.mockReset();
});

const AS_OF = "2026-11-04";

function renderWorkspace(o: {
  plan?: CattleGroupProductionPlan;
  category?: LivestockCategory;
  goal?: LivestockGoal;
  system?: "grazing" | "housed";
  weight?: number;
} = {}) {
  const weight = o.weight ?? 300;
  const metrics = deriveCattleGroupProductionPlanMetrics({ plan: o.plan, currentWeightKg: weight, headCount: 20, asOfDate: AS_OF });
  const operations = buildCattleOperationsVM({
    state: "OK",
    fields: [{ id: "field-1", name: "P. Collins" }],
    groups: [{
      groupId: "group-1",
      category: o.category ?? "weanling",
      goal: o.goal ?? "grow",
      system: o.system ?? "housed",
      headCount: 20,
      averageWeightKg: weight,
      averageWeightSource: "Farmer group estimate",
      currentField: { id: "field-1", name: "P. Collins", since: "2026-11-02T00:00:00.000Z" },
      ...(o.plan ? { productionPlan: o.plan } : {}),
      productionMetrics: metrics,
      grazingDemand: {
        status: "resolved",
        provider: "beef_liveweight_v1",
        groupId: "group-1",
        category: "weanling",
        headCount: 20,
        kgDmPerHeadDay: 6,
        dailyDemandKgDm: 120,
        confidence: "medium",
        source: "Teagasc beef grazing guidance",
        ruleId: "TEAGASC_BEEF_GRAZING_2PCT_LW",
        evidence: [],
      },
    }],
  }, AS_OF);
  return render(
    <CattleGroupWorkspace
      vm={cattleGroupOperationsFor(operations, "group-1")}
      asOfDate={AS_OF}
      workLabel="No open weighing work"
      workDetail="Other work not inferred"
    />,
  );
}

const labPlan: CattleGroupProductionPlan = {
  groupId: "group-1",
  farmId: "farm-1",
  targetWeightKg: 360,
  targetDate: "2027-02-12",
  silageQualityBasis: "lab_analysis",
  silageDmdPct: 70,
  silageCpPct: 10,
  silageAnalysisDate: "2026-10-20",
};

const feedingPlan = () => within(document.querySelector("[data-feeding-plan]") as HTMLElement);

describe("CattleGroupWorkspace — goal-first feeding plan", () => {
  it("generates the Teagasc guideline plan from a target and a lab silage result", () => {
    renderWorkspace({ plan: labPlan });
    expect(screen.getByText("P. Collins")).toBeInTheDocument();
    expect(screen.getByText("0.60")).toBeInTheDocument();
    const card = feedingPlan();
    expect(card.getByText("Teagasc guideline")).toBeInTheDocument();
    expect(card.getByText("1.2")).toBeInTheDocument();
    expect(card.getByText("kg/head/day")).toBeInTheDocument();
    expect(card.getByText("70 DMD · 10% CP")).toBeInTheDocument();
    expect(card.getByText(">0.94 UFL/kg")).toBeInTheDocument();
    expect(card.getByText("20% CP")).toBeInTheDocument();
    expect(card.getByText("2.4 t")).toBeInTheDocument();
    expect(card.getByText("≈ €840")).toBeInTheDocument();
    expect(card.getByRole("link", { name: /inputs market/i })).toHaveAttribute("href", "/inputs-market?category=feed");
    expect(screen.getByText("€0.42")).toBeInTheDocument();
    expect(screen.getByText(/^Concentrate only\. Silage, housing/)).toBeInTheDocument();
    expect(screen.queryByText(/economic optimum:/i)).toBeNull();
  });

  it("does not ask for concentrate rate, prices, forage, housing or a ration as core fields", () => {
    renderWorkspace();
    const form = document.querySelector("[data-production-plan] form") as HTMLElement;
    expect(within(form).getByLabelText("Target weight (kg)")).toBeVisible();
    expect(within(form).getByLabelText("Target date")).toBeVisible();
    expect(within(form).queryByLabelText(/forage/i)).toBeNull();
    expect(within(form).queryByLabelText(/housing/i)).toBeNull();
    expect(within(form).queryByLabelText(/diet \/ ration/i)).toBeNull();
    const advanced = form.querySelector("details") as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
    expect(within(advanced).getByText(/farmer \/ advisor override/i)).toBeInTheDocument();
    expect(within(advanced).getByLabelText("Concentrate kg/head/day")).toBeInTheDocument();
  });

  it("calculates the required ADG live and asks for silage analysis instead of inventing a rate", () => {
    renderWorkspace();
    expect(feedingPlan().getByText("More information required")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Target weight (kg)"), { target: { value: "360" } });
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2027-02-12" } });
    expect(screen.getByText("0.60")).toBeInTheDocument();
    expect(screen.getByText("60 kg over 100 days")).toBeInTheDocument();
    const card = feedingPlan();
    expect(card.getByText("Rate not generated")).toBeInTheDocument();
    expect(card.getByText("Add a silage lab analysis (DMD, CP)")).toBeInTheDocument();
    expect(card.getByText("Unknown")).toBeInTheDocument();
    expect(card.getByText(/record the silage lab analysis/i)).toBeInTheDocument();
  });

  it("labels a planning scenario explicitly", () => {
    renderWorkspace({ plan: { ...labPlan, silageQualityBasis: "planning_scenario", silageDmdPct: 72, silageCpPct: undefined, silageAnalysisDate: undefined } });
    const card = feedingPlan();
    expect(card.getByText("Planning scenario · silage not tested")).toBeInTheDocument();
    expect(card.getByText("72 DMD (assumed)")).toBeInTheDocument();
    expect(card.getByText("0.9")).toBeInTheDocument();
  });

  it("says the target is outside the evidence rather than generating a precise ration", () => {
    renderWorkspace({ plan: { ...labPlan, targetWeightKg: 400 } });
    const card = feedingPlan();
    expect(card.getByText("Outside current evidence · advisor review")).toBeInTheDocument();
    expect(card.getByText("Rate not generated")).toBeInTheDocument();
    expect(card.queryByText("kg/head/day")).toBeNull();
    expect(card.getByText("At the guideline gain")).toBeInTheDocument();
  });

  it("marks an override as farmer/advisor, keeps the guideline visible and opens the advanced disclosure", () => {
    renderWorkspace({ plan: { ...labPlan, concentrateKgHeadDay: 2 } });
    const card = feedingPlan();
    expect(card.getByText("Farmer/advisor override")).toBeInTheDocument();
    expect(card.getByText(/Teagasc guideline 1\.2 kg/)).toBeInTheDocument();
    expect((document.querySelector("[data-production-plan] details") as HTMLDetailsElement).open).toBe(true);
  });

  it("discloses assumptions and evidence with source links", () => {
    renderWorkspace({ plan: labPlan });
    const card = feedingPlan();
    expect(card.getByText(/assumed because the group is recorded as housed/i)).toBeInTheDocument();
    expect(card.getByRole("link", { name: /Silage Quality and Concentrate Supplementation/ })).toHaveAttribute("href", expect.stringContaining("teagasc.ie"));
  });

  it("saves the goal and silage context without touching the legacy cost fields", async () => {
    save.mockResolvedValue({ status: "saved" });
    renderWorkspace({ plan: labPlan });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    const payload = save.mock.calls[0][0];
    expect(payload).toMatchObject({
      groupId: "group-1",
      targetKg: 360,
      targetDate: "2027-02-12",
      feedingSituation: null,
      silageQualityBasis: "lab_analysis",
      silageDmdPct: 70,
      silageCpPct: 10,
      silageAnalysisDate: "2026-10-20",
      concentrateKgHeadDay: null,
    });
    expect(payload).not.toHaveProperty("forageCostEurHeadDay");
    expect(payload).not.toHaveProperty("housingCostEurHeadDay");
    expect(payload).not.toHaveProperty("dietLabel");
  });
});
