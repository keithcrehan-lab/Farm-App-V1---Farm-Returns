import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildCattleOperationsVM,
  cattleGroupOperationsFor,
} from "@/domain/cattle/presentation";
import { deriveCattleGroupProductionPlanMetrics, type CattleGroupProductionPlan } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import { CattleGroupWorkspace } from "./CattleGroupWorkspace";

const save = vi.fn();
const move = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions/grazing-field-movements", () => ({ moveLivestockGroupToFieldAction: (...args: unknown[]) => move(...args) }));
vi.mock("@/app/actions/cattle-group-production-plan", () => ({ saveCattleGroupProductionPlanAction: (...args: unknown[]) => save(...args) }));

afterEach(() => {
  cleanup();
  save.mockReset();
  move.mockReset();
  refresh.mockReset();
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
      averageWeightSource: "Individual animal records",
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

describe("CattleGroupWorkspace — interaction-first group state", () => {
  it("shows the important group state immediately and keeps the production form closed", () => {
    renderWorkspace({ plan: labPlan });
    expect(screen.getByRole("button", { name: /Current location/i })).toHaveTextContent("P. Collins");
    expect(screen.getByRole("button", { name: /^Production target/i })).toHaveTextContent("360");
    expect(screen.getByRole("button", { name: /^Feeding/i })).toHaveTextContent("1.2");
    const edit = screen.getByRole("button", { name: "Edit production target" });
    expect(edit).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Target weight (kg)")).toBeNull();
  });

  it("reveals production inputs only when the farmer enters edit mode", () => {
    renderWorkspace({ plan: labPlan });
    fireEvent.click(screen.getByRole("button", { name: "Edit production target" }));
    expect(screen.getByRole("button", { name: "Close editor" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Target weight (kg)")).toHaveValue("360");
    expect(screen.getByLabelText("Target date")).toHaveValue("2027-02-12");
    expect(screen.queryByLabelText(/forage/i)).toBeNull();
    expect(screen.queryByLabelText(/housing/i)).toBeNull();
    expect(screen.queryByLabelText(/diet \/ ration/i)).toBeNull();
    const advanced = screen.getByText(/farmer \/ advisor override/i).closest("details") as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
  });

  it("saves the goal and silage context through the existing action and returns to read state", async () => {
    save.mockResolvedValue({ status: "saved" });
    renderWorkspace({ plan: labPlan });
    fireEvent.click(screen.getByRole("button", { name: "Edit production target" }));
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({
      groupId: "group-1",
      targetKg: 360,
      targetDate: "2027-02-12",
      silageQualityBasis: "lab_analysis",
      silageDmdPct: 70,
      silageCpPct: 10,
      silageAnalysisDate: "2026-10-20",
      concentrateKgHeadDay: null,
    });
    await vi.waitFor(() => expect(screen.queryByLabelText("Target weight (kg)")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps movement contextual to the current-location state and uses the existing movement action", async () => {
    move.mockResolvedValue({ status: "saved" });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Current location/i }));
    expect(screen.getByRole("button", { name: "Move cattle" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move cattle" }));
    expect(screen.getByLabelText("Destination field")).toHaveValue("field-1");
    fireEvent.click(screen.getByRole("button", { name: "Record move" }));
    await vi.waitFor(() => expect(move).toHaveBeenCalledWith({
      livestockGroupId: "group-1",
      fieldId: "field-1",
      movedOn: AS_OF,
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the feeding answer first and keeps evidence one interaction away", () => {
    renderWorkspace({ plan: labPlan });
    const card = feedingPlan();
    expect(card.getByRole("heading", { name: "1.2 kg/head/day" })).toBeInTheDocument();
    expect(card.getByText("Teagasc guideline")).toBeInTheDocument();
    expect(card.getByRole("link", { name: /inputs market/i })).toHaveAttribute("href", "/inputs-market?category=feed");
    const why = card.getByText("Why this recommendation?").closest("details") as HTMLDetailsElement;
    expect(why.open).toBe(false);
    expect(within(why).getByText("70 DMD · 10% CP")).toBeInTheDocument();
    expect(within(why).getByRole("link", { name: /Silage Quality and Concentrate Supplementation/ })).toHaveAttribute("href", expect.stringContaining("teagasc.ie"));
  });

  it("asks for missing evidence rather than inventing a ration", () => {
    renderWorkspace();
    expect(feedingPlan().getAllByText("More information required").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Edit production target" }));
    fireEvent.change(screen.getByLabelText("Target weight (kg)"), { target: { value: "360" } });
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2027-02-12" } });
    expect(screen.getAllByText("0.60").length).toBeGreaterThan(0);
    const why = feedingPlan().getByText("Why this recommendation?").closest("details") as HTMLDetailsElement;
    expect(within(why).getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(feedingPlan().getByText("Add a silage lab analysis (DMD, CP)")).toBeInTheDocument();
  });

  it("keeps planning scenarios and unsupported targets explicit", () => {
    const { rerender } = renderWorkspace({ plan: { ...labPlan, silageQualityBasis: "planning_scenario", silageDmdPct: 72, silageCpPct: undefined, silageAnalysisDate: undefined } });
    let why = feedingPlan().getByText("Why this recommendation?").closest("details") as HTMLDetailsElement;
    expect(feedingPlan().getByRole("heading", { name: "0.9 kg/head/day" })).toBeInTheDocument();
    expect(within(why).getByText("72 DMD (assumed)")).toBeInTheDocument();
    cleanup();
    renderWorkspace({ plan: { ...labPlan, targetWeightKg: 400 } });
    expect(feedingPlan().getAllByText("Outside current evidence · advisor review").length).toBeGreaterThan(0);
    why = feedingPlan().getByText("Why this recommendation?").closest("details") as HTMLDetailsElement;
    expect(within(why).getByText("Not sized")).toBeInTheDocument();
    expect(feedingPlan().queryByRole("heading", { name: /kg\/head\/day/ })).toBeNull();
    void rerender;
  });

  it("labels a farmer/advisor override and only exposes override inputs in edit mode", () => {
    renderWorkspace({ plan: { ...labPlan, concentrateKgHeadDay: 2 } });
    const card = feedingPlan();
    expect(card.getByText("Farmer/advisor override")).toBeInTheDocument();
    expect(card.getByText(/The Teagasc guideline is shown alongside for comparison/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Concentrate kg/head/day")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit production target" }));
    const advanced = screen.getByText(/farmer \/ advisor override/i).closest("details") as HTMLDetailsElement;
    expect(advanced.open).toBe(true);
    expect(screen.getByLabelText("Concentrate kg/head/day")).toBeInTheDocument();
  });

  it("defines reduced-motion behaviour for the interaction surfaces", () => {
    const css = readFileSync("src/components/cattle/continuity/CattleGroupWorkspace.module.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/transition:\s*none\s*!important/);
    expect(css).toMatch(/animation:\s*none\s*!important/);
  });
});
