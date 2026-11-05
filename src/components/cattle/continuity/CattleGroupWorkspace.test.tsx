import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildCattleOperationsVM,
  cattleGroupOperationsFor,
  type GroupAnimalFacts,
} from "@/domain/cattle/presentation";
import { deriveCattleGroupProductionPlanMetrics, type CattleGroupProductionPlan } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import { CattleGroupWorkspace } from "./CattleGroupWorkspace";

const save = vi.fn();
const move = vi.fn();
const house = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions/grazing-field-movements", () => ({
  moveLivestockGroupToFieldAction: (...args: unknown[]) => move(...args),
  moveLivestockGroupToHousingAction: (...args: unknown[]) => house(...args),
}));
vi.mock("@/app/actions/cattle-group-production-plan", () => ({ saveCattleGroupProductionPlanAction: (...args: unknown[]) => save(...args) }));

afterEach(() => {
  cleanup();
  save.mockReset();
  move.mockReset();
  house.mockReset();
  refresh.mockReset();
});

const AS_OF = "2026-11-04";

function renderWorkspace(o: {
  plan?: CattleGroupProductionPlan;
  category?: LivestockCategory;
  goal?: LivestockGoal;
  system?: "grazing" | "housed";
  weight?: number;
  avgAgeMonths?: number;
  animals?: GroupAnimalFacts;
  /** Housed groups are in the shed (no open field session); grazing groups are on the field. */
  conflict?: boolean;
} = {}) {
  const system = o.system ?? "housed";
  const weight = o.weight ?? 300;
  const metrics = deriveCattleGroupProductionPlanMetrics({ plan: o.plan, currentWeightKg: weight, headCount: 20, asOfDate: AS_OF });
  const operations = buildCattleOperationsVM({
    state: "OK",
    fields: [{ id: "field-1", name: "P. Collins" }],
    housing: [{ id: "shed-1", name: "Slatted shed" }, { id: "shed-2", name: "Straw shed" }],
    groups: [{
      groupId: "group-1",
      category: o.category ?? "weanling",
      ...("goal" in o ? (o.goal ? { goal: o.goal } : {}) : { goal: "grow" as const }),
      system,
      ...(system === "housed" ? { currentHousing: { id: "shed-1", name: "Slatted shed" } } : {}),
      ...(o.avgAgeMonths !== undefined ? { avgAgeMonths: o.avgAgeMonths } : {}),
      headCount: 20,
      averageWeightKg: weight,
      averageWeightSource: "Farmer",
      ...(system === "grazing" || o.conflict ? { currentField: { id: "field-1", name: "P. Collins", since: "2026-11-02T00:00:00.000Z" } } : {}),
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
  }, AS_OF, o.animals ? { "group-1": o.animals } : {});
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
    expect(screen.getByRole("button", { name: /Current location/i })).toHaveTextContent("Housed · Slatted shed");
    expect(screen.getByRole("button", { name: /^Production target/i })).toHaveTextContent("360");
    expect(screen.getByRole("button", { name: /^Feeding/i })).toHaveTextContent("1.2");
    const edit = screen.getByRole("button", { name: "Override / edit production target" });
    expect(edit).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Target weight (kg)")).toBeNull();
  });

  it("reveals production inputs only when the farmer enters edit mode", () => {
    renderWorkspace({ plan: labPlan });
    fireEvent.click(screen.getByRole("button", { name: "Override / edit production target" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Override / edit production target" }));
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

  it("a housed group moves to a field through the existing movement action", async () => {
    move.mockResolvedValue({ status: "saved" });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: /Current location/i }));
    fireEvent.click(screen.getByRole("button", { name: "Move to a field" }));
    expect(screen.getByLabelText("Destination field")).toHaveValue("field-1");
    fireEvent.click(screen.getByRole("button", { name: "Record move" }));
    await vi.waitFor(() => expect(move).toHaveBeenCalledWith({
      livestockGroupId: "group-1",
      fieldId: "field-1",
      movedOn: AS_OF,
    }));
    expect(refresh).toHaveBeenCalled();
    expect(house).not.toHaveBeenCalled();
  });

  it("a grazing group moves into housing: shed and date go to the housing action, then the page refreshes", async () => {
    house.mockResolvedValue({ status: "saved", closedSessionId: "session-1" });
    renderWorkspace({ system: "grazing" });
    expect(screen.getByRole("button", { name: /Current location/i })).toHaveTextContent("P. Collins");
    fireEvent.click(screen.getByRole("button", { name: /Current location/i }));
    expect(screen.getByRole("button", { name: "Move to another field" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to housing" }));
    fireEvent.change(screen.getByLabelText("Shed"), { target: { value: "shed-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Record housing" }));
    await vi.waitFor(() => expect(house).toHaveBeenCalledWith({ livestockGroupId: "group-1", housingId: "shed-2", housedOn: AS_OF }));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText(/Moved into housing\. Any open grazing session was closed on that date/)).toBeInTheDocument();
    expect(move).not.toHaveBeenCalled();
  });

  it("a rejected housing move is reported and nothing refreshes", async () => {
    house.mockResolvedValue({ status: "rejected", reasonCode: "MOVE_NOT_AFTER_CURRENT_START" });
    renderWorkspace({ system: "grazing" });
    fireEvent.click(screen.getByRole("button", { name: /Current location/i }));
    fireEvent.click(screen.getByRole("button", { name: "Move to housing" }));
    fireEvent.click(screen.getByRole("button", { name: "Record housing" }));
    expect(await screen.findByText("Move to housing wasn't saved: move not after current start.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a field and a shed recorded at once is shown as a conflict, never one of them silently", () => {
    renderWorkspace({ conflict: true });
    expect(screen.getByRole("button", { name: /Current location/i })).toHaveTextContent("Field and shed both recorded");
    expect(document.querySelector("[data-production-advisory]")).toHaveAttribute("data-production-advisory", "ALMOST_READY");
  });

  it("the weight tile shows partial individual coverage instead of a full-group mean (wording from presentation)", () => {
    renderWorkspace({
      animals: {
        state: "KNOWN",
        animals: [
          { animalId: "a-1", dateOfBirth: "2026-03-01", sex: "MALE", breedKnown: true, latestWeightKg: 310, latestWeighedAt: "2026-10-30T10:00:00Z", weighings: 2 },
          { animalId: "a-2", dateOfBirth: "2026-03-01", sex: "MALE", breedKnown: true, latestWeightKg: null, latestWeighedAt: null, weighings: 0 },
        ],
      },
    });
    const tile = screen.getByRole("button", { name: /Current avg weight/i });
    expect(tile).toHaveTextContent("1 of 2 weighed");
    expect(tile).toHaveTextContent(/isn't the group's average/);
    expect(tile).not.toHaveTextContent("300");
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
    fireEvent.click(screen.getByRole("button", { name: "Override / edit production target" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Override / edit production target" }));
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

const advisory = () => within(document.querySelector("[data-production-advisory]") as HTMLElement);

describe("CattleGroupWorkspace — production recommendation", () => {
  it("an unresolved system is the only blocker: the exact item with its location action, and no pace", () => {
    renderWorkspace({ plan: labPlan, conflict: true });
    const card = advisory();
    expect(card.getByRole("heading", { name: "Almost ready" })).toBeInTheDocument();
    const required = within(document.querySelector("[data-advisory-required]") as HTMLElement);
    expect(required.getByText("Production system")).toBeInTheDocument();
    expect(required.queryByText("Age")).toBeNull();
    fireEvent.click(required.getByRole("button", { name: "Record where the group is now" }));
    expect(document.getElementById("group-state-location")).toBeInTheDocument();
    expect(card.queryByText(/kg\/day/)).toBeNull();
    expect(card.queryByRole("button", { name: /Use recommended plan/i })).toBeNull();
  });

  it("housed weanlings: the path, readiness, confidence, reasons, improvements, economics and notes", () => {
    renderWorkspace({ plan: labPlan, avgAgeMonths: 8 });
    const card = advisory();
    expect(document.querySelector("[data-production-advisory]")).toHaveAttribute("data-production-advisory", "RECOMMENDED");
    expect(card.getByRole("heading", { name: "Grow on as weanlings at about 0.6 kg/day this winter" })).toBeInTheDocument();
    expect(card.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(card.getAllByText("Low confidence").length).toBeGreaterThan(0);
    const improve = within(document.querySelector("[data-advisory-improve]") as HTMLElement);
    expect(improve.getByText("What would raise confidence")).toBeInTheDocument();
    expect(improve.getByText("Breed / type")).toBeInTheDocument();
    expect(improve.getByRole("link", { name: "Add the breed in Edit group details" })).toHaveAttribute("href", "#edit-group-details");
    expect(within(document.querySelector("[data-advisory-reasons]") as HTMLElement).getByText(/Age \(evidence, not used by a v1 rule\): 8 months average/)).toBeInTheDocument();
    expect(within(document.querySelector("[data-advisory-economics]") as HTMLElement).getByText(/^Economics (limited|not ready)$/)).toBeInTheDocument();
    expect(card.getByText(/Only one production path is in v1 scope/)).toBeInTheDocument();
    expect(card.getByText(/^No target weight or date is derived/)).toBeInTheDocument();
    expect(card.getByText(/^Advisory only/)).toBeInTheDocument();
    expect(card.queryByRole("button", { name: /Use recommended plan/i })).toBeNull();
  });

  it("grazing weanlings: says current evidence doesn't cover grazing instead of presenting the housed pace", () => {
    renderWorkspace({ system: "grazing", avgAgeMonths: 8 });
    const card = advisory();
    expect(document.querySelector("[data-production-advisory]")).toHaveAttribute("data-production-advisory", "EVIDENCE_GAP");
    expect(card.getByRole("heading", { name: "Grow on as weanlings · pace not covered" })).toBeInTheDocument();
    expect(card.getByText("Current evidence doesn't cover cattle at grass")).toBeInTheDocument();
    expect(card.queryByText(/0\.6 kg\/day/)).toBeNull();
  });

  it("steers without a goal: feasible paths unranked, and choosing a goal opens the target editor", () => {
    renderWorkspace({ category: "steer", goal: undefined, avgAgeMonths: 18 });
    const card = advisory();
    expect(card.getByRole("heading", { name: "2 feasible paths · not ranked" })).toBeInTheDocument();
    const paths = within(document.querySelector("[data-advisory-paths]") as HTMLElement);
    expect(paths.getByText("Finish to slaughter")).toBeInTheDocument();
    expect(paths.getByText("Grow on and sell as stores")).toBeInTheDocument();
    expect(card.getByText(/These paths aren't ranked/)).toBeInTheDocument();
    fireEvent.click(card.getByRole("button", { name: "Choose the group's goal" }));
    expect(screen.getByLabelText("Group goal")).toHaveValue("");
  });

  it("reads age and liveweight from the individual animal records", () => {
    renderWorkspace({
      plan: labPlan,
      animals: { state: "KNOWN", animals: [{ animalId: "a-1", dateOfBirth: "2026-03-01", sex: "FEMALE", breedKnown: true, latestWeightKg: 310, latestWeighedAt: "2026-10-30T10:00:00Z", weighings: 1 }] },
    });
    const card = advisory();
    expect(card.getByRole("heading", { name: /Grow on as weanlings/ })).toBeInTheDocument();
    expect(card.getByText("Age (evidence, not used by a v1 rule): 8 months · from 1 date of birth.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Current avg weight/i })).toHaveTextContent("310");
  });

  it("an improvement action opens the existing override editor", () => {
    renderWorkspace({ plan: { ...labPlan, silageQualityBasis: undefined, silageDmdPct: undefined, silageCpPct: undefined, silageAnalysisDate: undefined }, avgAgeMonths: 8 });
    expect(screen.queryByLabelText("Target weight (kg)")).toBeNull();
    fireEvent.click(advisory().getByRole("button", { name: "Add the silage lab analysis" }));
    expect(screen.getByLabelText("Target weight (kg)")).toHaveValue("360");
  });

  it("keeps the manual target editor as the override path and saves through the existing action", async () => {
    save.mockResolvedValue({ status: "saved" });
    renderWorkspace({ plan: labPlan, avgAgeMonths: 8 });
    const override = screen.getByRole("button", { name: "Override / edit production target" });
    expect(override).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(override);
    fireEvent.change(screen.getByLabelText("Target weight (kg)"), { target: { value: "380" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({ groupId: "group-1", goal: "grow", targetKg: 380, targetDate: "2027-02-12", silageQualityBasis: "lab_analysis" });
  });

  it("the group goal is chosen in the override editor and saved with the target", async () => {
    save.mockResolvedValue({ status: "saved" });
    renderWorkspace({ category: "steer", goal: undefined, plan: labPlan });
    fireEvent.click(screen.getByRole("button", { name: "Override / edit production target" }));
    fireEvent.change(screen.getByLabelText("Group goal"), { target: { value: "finish_slaughter" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toMatchObject({ groupId: "group-1", goal: "finish_slaughter" });
  });
});
