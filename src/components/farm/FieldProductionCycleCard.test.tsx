import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider, useFields } from "@/store/farm-store";
import { mockFields } from "@/data/mock-farm";
import { FieldProductionCycleCard } from "./FieldProductionCycleCard";
import { loadFieldProductionCycleAction, saveFieldProductionCycleAction } from "@/app/actions/fertiliser-field-evidence";

vi.mock("@/app/actions/fertiliser-field-evidence", () => ({
  loadFieldProductionCycleAction: vi.fn().mockResolvedValue({ cycle: null, gate: null }),
  saveFieldProductionCycleAction: vi.fn(),
}));

const field = mockFields[0];
type CycleState = Awaited<ReturnType<typeof loadFieldProductionCycleAction>>;

function renderCard() {
  return render(
    <FarmProvider>
      <FieldProductionCycleCard field={field} />
    </FarmProvider>,
  );
}

function openCard() {
  fireEvent.click(screen.getByRole("button", { name: /crop & production/i }));
}

function readySaveResult() {
  return {
    cycle: {
      id: "cycle-1",
      fieldId: field.id,
      season: String(new Date().getFullYear()),
      cropSystem: "GRASS_GRAZING",
      status: "active",
      evidence: {
        cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
        grazingProductionSystem: { value: "SUCKLER_CALF_TO_BEEF", method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
      },
      createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z",
    },
    gate: { status: "READY_FOR_CALCULATION", missingInputs: [] },
  } as unknown as CycleState & { cycle: NonNullable<CycleState["cycle"]> };
}

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  cleanup();
  vi.clearAllMocks();
  vi.mocked(loadFieldProductionCycleAction).mockResolvedValue({ cycle: null, gate: null } as CycleState);
});

describe("FieldProductionCycleCard — streamlined chemical-fertiliser evidence", () => {
  it("shows the farm grazing baseline by default and keeps a field-specific system as an optional exception", async () => {
    renderCard();
    openCard();
    await waitFor(() => expect(loadFieldProductionCycleAction).toHaveBeenCalled());
    expect(screen.getByText("Farm baseline")).toBeTruthy();
    expect(screen.getByText("Suckler cows, calves kept to stores or beef")).toBeTruthy();
    expect(screen.queryByLabelText("Field exception")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /set field exception/i }));
    expect(screen.getByLabelText("Field exception")).toBeTruthy();
  });

  it("explains each field use with an example, and the production target with its validated scope", async () => {
    renderCard();
    openCard();
    await waitFor(() => expect(loadFieldProductionCycleAction).toHaveBeenCalled());
    const crop = screen.getByLabelText(/crop system/i);
    const context = () => document.getElementById(crop.getAttribute("aria-describedby") ?? "")?.textContent;
    expect(context()).toMatch(/Grazed through the season.*e\.g\. paddocks/);

    fireEvent.change(crop, { target: { value: "GRASS_FIRST_CUT_SILAGE" } });
    expect(context()).toMatch(/Closed in spring for one silage cut/);
    const target = screen.getByLabelText(/production target/i);
    const targetContext = document.getElementById(target.getAttribute("aria-describedby") ?? "")?.textContent;
    expect(targetContext).toMatch(/dry matter you expect to harvest/);
    expect(targetContext).toMatch(/published 5 t DM\/ha table; another target is saved but not calculated/);

    fireEvent.change(crop, { target: { value: "GRASS_MIXED" } });
    expect(context()).toMatch(/grazed early, closed for a June cut/);
  });

  it("records white-clover grazing swards as one of the three Teagasc April clover classes", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(readySaveResult());
    renderCard();
    openCard();
    await waitFor(() => expect(loadFieldProductionCycleAction).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/crop system/i), { target: { value: "GRASS_WHITE_CLOVER_GRAZING" } });
    const classes = screen.getByRole("radiogroup", { name: /white clover in the sward in april/i });
    expect(classes.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(screen.queryByLabelText(/white clover content \(%\)/i)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "About 5%" }));
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));
    await waitFor(() => expect(saveFieldProductionCycleAction).toHaveBeenCalled());
    expect(vi.mocked(saveFieldProductionCycleAction).mock.calls[0][0]).toMatchObject({ aprilWhiteCloverPct: 5 });
  });

  it("asks one farmer-facing question first and only shows N/P/K boxes after Yes", async () => {
    renderCard();
    openCard();
    await waitFor(() => expect(loadFieldProductionCycleAction).toHaveBeenCalled());

    expect(screen.queryByLabelText("Chemical N applied")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText("Chemical N applied")).toBeTruthy();
    expect(screen.getByLabelText("Chemical P applied")).toBeTruthy();
    expect(screen.getByLabelText("Chemical K applied")).toBeTruthy();
  });

  it("No is an explicit declaration of zero for N, P and K", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(readySaveResult());
    renderCard();
    openCard();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));

    await waitFor(() => expect(saveFieldProductionCycleAction).toHaveBeenCalled());
    expect(vi.mocked(saveFieldProductionCycleAction).mock.calls[0][0]).toMatchObject({
      chemicalNAppliedKgHa: 0,
      chemicalPAppliedKgHa: 0,
      chemicalKAppliedKgHa: 0,
    });
  });

  it("Not sure keeps chemical nutrient evidence unknown rather than silently saving zero", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(readySaveResult());
    renderCard();
    openCard();
    fireEvent.click(screen.getByRole("radio", { name: "Not sure" }));
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));

    await waitFor(() => expect(saveFieldProductionCycleAction).toHaveBeenCalled());
    const payload = vi.mocked(saveFieldProductionCycleAction).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("chemicalNAppliedKgHa");
    expect(payload).not.toHaveProperty("chemicalPAppliedKgHa");
    expect(payload).not.toHaveProperty("chemicalKAppliedKgHa");
  });

  it("never renders a raw backend error object", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockRejectedValue(new Error("{code: 23505, details: null, hint: null, message: duplicate}"));
    renderCard();
    openCard();
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));

    await waitFor(() => expect(screen.getByText("Could not save production evidence. Please try again.")).toBeTruthy());
    expect(document.body.textContent).not.toContain("23505");
    expect(document.body.textContent).not.toContain("details: null");
  });
});

describe("FieldProductionCycleCard — quote-planning season", () => {
  const currentSeason = String(new Date().getFullYear());
  const nextSeason = String(new Date().getFullYear() + 1);

  it("starts from the carried-forward current cycle but saves a planned cycle into the planning season, leaving the current season untouched", async () => {
    const current = readySaveResult();
    vi.mocked(loadFieldProductionCycleAction).mockImplementation(async (_fieldId, season) =>
      season === currentSeason ? current : ({ cycle: null, gate: null } as CycleState),
    );
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(current);
    render(
      <FarmProvider>
        <FieldProductionCycleCard field={field} planningSeason={nextSeason} defaultOpen />
      </FarmProvider>,
    );
    expect(await screen.findByText(`${nextSeason} production cycle`)).toBeTruthy();
    expect(screen.getByText(new RegExp(`No ${nextSeason} cycle is saved, so this ${currentSeason} cycle is carried forward`))).toBeTruthy();
    expect(loadFieldProductionCycleAction).toHaveBeenCalledWith(field.id, nextSeason);
    // Prior-season chemical fertiliser is not asked for a future season.
    expect(screen.queryByRole("radiogroup", { name: /chemical fertiliser already applied/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(saveFieldProductionCycleAction).toHaveBeenCalled());
    const saved = vi.mocked(saveFieldProductionCycleAction).mock.calls[0][0];
    expect(saved.season).toBe(nextSeason);
    expect(saved.status).toBe("planned");
    expect(saved.chemicalNAppliedKgHa).toBeUndefined();
    expect(saved.chemicalPAppliedKgHa).toBeUndefined();
    expect(saved.chemicalKAppliedKgHa).toBeUndefined();
  });

  it("edits the planning season's own cycle when one is saved", async () => {
    const next = readySaveResult();
    next.cycle.season = nextSeason;
    vi.mocked(loadFieldProductionCycleAction).mockImplementation(async (_fieldId, season) =>
      season === nextSeason ? next : readySaveResult(),
    );
    render(
      <FarmProvider>
        <FieldProductionCycleCard field={field} planningSeason={nextSeason} defaultOpen />
      </FarmProvider>,
    );
    expect(await screen.findByText(`${nextSeason} production cycle`)).toBeTruthy();
    expect(screen.queryByText(/is carried forward/)).toBeNull();
    expect(loadFieldProductionCycleAction).not.toHaveBeenCalledWith(field.id, currentSeason);
  });
});

// Codex audit F010: saving clover evidence must reach the farm store's field
// at once, so client-side nutrient plans never keep the grass-only N.
describe("FieldProductionCycleCard — the saved sward reaches the farm store", () => {
  function SwardProbe() {
    const current = useFields().find((candidate) => candidate.id === field.id);
    return <output data-testid="sward">{JSON.stringify(current?.grazingSward ?? null)}</output>;
  }

  it("a saved 10% April clover cycle sets the field's sward without a reload", async () => {
    const clover = readySaveResult();
    clover.cycle = {
      ...clover.cycle,
      cropSystem: "GRASS_WHITE_CLOVER_GRAZING",
      evidence: {
        ...clover.cycle.evidence,
        cropSystem: { value: "GRASS_WHITE_CLOVER_GRAZING", method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
        aprilWhiteCloverPct: { value: 10, method: "FARMER_DECLARED", source: "April sward class · Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
      },
    } as typeof clover.cycle;
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(clover);
    render(
      <FarmProvider>
        <FieldProductionCycleCard field={field} />
        <SwardProbe />
      </FarmProvider>,
    );
    openCard();
    await waitFor(() => expect(loadFieldProductionCycleAction).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));
    await waitFor(() => expect(screen.getByTestId("sward").textContent).toBe(JSON.stringify({ kind: "WHITE_CLOVER", aprilWhiteCloverPct: 10 })));
  });

  it("a saved grass cycle sets a grass sward", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(readySaveResult());
    render(
      <FarmProvider>
        <FieldProductionCycleCard field={field} />
        <SwardProbe />
      </FarmProvider>,
    );
    openCard();
    await waitFor(() => expect(loadFieldProductionCycleAction).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));
    await waitFor(() => expect(screen.getByTestId("sward").textContent).toBe(JSON.stringify({ kind: "GRASS" })));
  });
});
