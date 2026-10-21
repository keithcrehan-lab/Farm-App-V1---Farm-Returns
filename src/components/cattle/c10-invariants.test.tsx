import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const loadCattleAnimal = vi.fn();
const projectCattleWeight = vi.fn();
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: (...a: unknown[]) => loadCattleAnimal(...a), projectCattleWeight: (...a: unknown[]) => projectCattleWeight(...a), loadCattleHerd: vi.fn() }));

import { demoAnimalView, demoProjection } from "@/server/cattle-demo/demo-service";
import type { CattleDemoScenario } from "@/server/cattle-demo/demo-replay";
import { AnimalPlanScreen } from "./AnimalPlanScreen";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { RecordWeightSheet } from "./RecordWeightSheet";
import { CattleDemoSessionProvider } from "./session/CattleDemoSessionProvider";
import type { CattleDemoSession } from "./session/demo-session";

// Rendered checks of the three C10 invariants (F005 / F007 / F012), over the real demonstration replay.

const EMPTY: CattleDemoSession = { version: 1, events: [] };

beforeEach(() => {
  loadCattleAnimal.mockImplementation(async (session: CattleDemoSession, tag: string, scenario?: CattleDemoScenario) => ({ ok: true, value: demoAnimalView(session, tag, scenario) }));
  projectCattleWeight.mockImplementation(async (session: CattleDemoSession, tag: string, date: string, scenario?: CattleDemoScenario) => ({ ok: true, value: demoProjection(session, tag, date, scenario) }));
});
afterEach(() => cleanup());

const sheetFor = (tag: string, scenario: CattleDemoScenario = "STANDARD", onSave = vi.fn(() => null)) => {
  const view = demoAnimalView(EMPTY, tag, scenario)!;
  render(<RecordWeightSheet open onClose={() => {}} onSave={onSave} tag={tag} previous={view.profile.weight} asOfDate="2026-10-16" />);
  return onSave;
};
const hint = () => document.getElementById("cattle-weight-hint")!.textContent ?? "";

describe("F005 — the record-weight sheet's previous weight (through the profile view-model)", () => {
  it.each([
    ["1427", "STANDARD", "KNOWN", /^Last recorded 521 kg on 14 Sep\./],
    ["1442", "STANDARD", "NONE", /^No earlier weight recorded\./],
    ["1438", "STANDARD", "CONFLICT", /^Previous weight couldn't be determined — records disagree \(498 kg or 512 kg\)\./],
    ["1427", "PLANNING_RUN_FAILURE", "UNAVAILABLE", /^Previous weight couldn't be checked\./],
  ] as const)("%s (%s) → %s", (tag, scenario, state, line) => {
    sheetFor(tag, scenario);
    expect(document.querySelector("[data-previous-weight]")?.getAttribute("data-previous-weight")).toBe(state);
    expect(hint()).toMatch(line);
    if (state !== "NONE") expect(hint()).not.toMatch(/No earlier weight recorded/);
  });

  it("a conflicting animal's sheet starts empty — no reading is invented, averaged or picked", () => {
    sheetFor("1438");
    expect(screen.getByLabelText("Scale reading")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save weight" })).toBeDisabled();
  });

  it("the profile opens the sheet with the conflict wording (the full screen path)", () => {
    render(
      <CattleDemoSessionProvider>
        <AnimalProfileScreen initial={demoAnimalView(EMPTY, "1438")!} tag="1438" scenario="STANDARD" />
      </CattleDemoSessionProvider>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Record (a )?weight/ })[0]);
    expect(hint()).toMatch(/records disagree/);
    expect(hint()).not.toMatch(/No earlier weight/);
  });
});

describe("F007 — weight entry keeps its precision", () => {
  const press = (name: string, n = 1) => {
    for (let i = 0; i < n; i++) fireEvent.click(screen.getByRole("button", { name }));
  };
  const reading = () => (screen.getByLabelText("Scale reading") as HTMLInputElement).value;

  it("548.24 + 5 saves 553.24; − 5 gives 543.24", () => {
    const onSave = sheetFor("1442");
    fireEvent.change(screen.getByLabelText("Scale reading"), { target: { value: "548.24" } });
    press("Plus 5 kilograms");
    expect(reading()).toBe("553.24");
    fireEvent.click(screen.getByRole("button", { name: "Save weight" }));
    expect(onSave).toHaveBeenCalledWith({ kg: 553.24, observedDate: null });
    press("Minus 5 kilograms", 2);
    expect(reading()).toBe("543.24");
  });

  it("412.5 + 5 = 417.5; repeated steps return exactly to the start", () => {
    sheetFor("1442");
    fireEvent.change(screen.getByLabelText("Scale reading"), { target: { value: "412.5" } });
    press("Plus 5 kilograms");
    expect(reading()).toBe("417.5");
    press("Plus 5 kilograms", 9);
    press("Minus 5 kilograms", 10);
    expect(reading()).toBe("412.5");
  });

  it("the sheet starts from the exact previous canonical weight, not its rounded display", () => {
    const view = demoAnimalView({ version: 1, events: [{ kind: "RECORD_WEIGHT", tag: "1427", kg: 548.24, observedDate: null, seq: 1 } as never] }, "1427")!;
    render(<RecordWeightSheet open onClose={() => {}} onSave={() => null} tag="1427" previous={view.profile.weight} asOfDate="2026-10-16" />);
    expect(reading()).toBe("548.24");
    expect(hint()).toMatch(/^Last recorded 548\.24 kg/);
    press("Plus 5 kilograms");
    expect(reading()).toBe("553.24");
  });
});

describe("F012 / invariant C — the plan timeline and the money use the same intervals", () => {
  const plan = async (tag: string) => {
    await act(async () => {
      render(
        <CattleDemoSessionProvider>
          <AnimalPlanScreen initial={demoAnimalView(EMPTY, tag)!} tag={tag} scenario="STANDARD" />
        </CattleDemoSessionProvider>,
      );
    });
  };

  it("housing starting today: 49 housed days in the cost row AND 'housed from today' in the timeline", async () => {
    await plan("1427");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Planned sale date"), { target: { value: "2026-12-04" } });
      fireEvent.change(screen.getByLabelText("Planned housing date"), { target: { value: "2026-10-16" } });
    });
    expect(screen.getByText("49 housed days")).toBeInTheDocument();
    expect(screen.getByText(/49 days to sale · housed from today \(16 Oct\), 49 days housed/)).toBeInTheDocument();
    expect(screen.queryByText(/not housed before sale/)).toBeNull();
  });

  it.each([
    ["2026-10-17", "48 housed days", /1 at grass, 48 housed from 17 Oct/],
    ["2026-11-08", "26 housed days", /23 at grass, 26 housed from 8 Nov/],
  ])("housing on %s: the row and the timeline agree", async (date, row, line) => {
    await plan("1427");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Planned sale date"), { target: { value: "2026-12-04" } });
      fireEvent.change(screen.getByLabelText("Planned housing date"), { target: { value: date } });
    });
    expect(screen.getByText(row)).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
  });

  it("housing on the sale date: the plan says so and draws no split", async () => {
    await plan("1427");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Planned sale date"), { target: { value: "2026-12-04" } });
      fireEvent.change(screen.getByLabelText("Planned housing date"), { target: { value: "2026-12-04" } });
    });
    expect(screen.getByText(/The housing date is on or after the sale date/)).toBeInTheDocument();
    expect(screen.queryByText(/days to sale/)).toBeNull();
    expect(screen.queryByText(/housed days/)).toBeNull();
  });

  it("plan inputs step exactly (no 2-decimal rounding of a 4-decimal input)", async () => {
    await plan("1427");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Housing and bedding"), { target: { value: "0.375" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase Housing and bedding" }));
    });
    expect(screen.getByLabelText("Housing and bedding")).toHaveValue("0.425");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Concentrate price"), { target: { value: "342.125" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Decrease Concentrate price" }));
    });
    expect(screen.getByLabelText("Concentrate price")).toHaveValue("332.125");
  });
});
