import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const loadCattleAnimal = vi.fn();
const projectCattleWeight = vi.fn();
const loadCattleHerd = vi.fn();
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: (...a: unknown[]) => loadCattleAnimal(...a), projectCattleWeight: (...a: unknown[]) => projectCattleWeight(...a), loadCattleHerd: (...a: unknown[]) => loadCattleHerd(...a) }));

import { demoAnimalView, demoHerdView, demoProjection } from "@/server/cattle-demo/demo-service";
import { AnimalPlanScreen } from "./AnimalPlanScreen";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { CattleUnavailable } from "./CattleUnavailable";
import { moreNavItems } from "@/components/shell/nav-items";
import { GroupScreen, HerdScreen } from "./HerdScreens";
import { PerformanceChart } from "./PerformanceChart";
import { RecordWeightSheet } from "./RecordWeightSheet";
import { CattleDemoSessionProvider } from "./session/CattleDemoSessionProvider";
import type { CattleDemoSession } from "./session/demo-session";

const EMPTY: CattleDemoSession = { version: 1, events: [] };
const wrap = (ui: React.ReactNode) => render(<CattleDemoSessionProvider>{ui}</CattleDemoSessionProvider>);

beforeEach(() => {
  loadCattleAnimal.mockImplementation(async (session: CattleDemoSession, tag: string) => ({ ok: true, value: demoAnimalView(session, tag) }));
  projectCattleWeight.mockImplementation(async (session: CattleDemoSession, tag: string, date: string) => ({ ok: true, value: demoProjection(session, tag, date) }));
  loadCattleHerd.mockImplementation(async (session: CattleDemoSession) => ({ ok: true, value: demoHerdView(session) }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("C10 screens", { timeout: 60_000 }, () => {
  it("animal profile: identity, metrics, one dominant job, demonstration label, information classes", () => {
    wrap(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />);
    expect(screen.getByRole("heading", { level: 1, name: "1427" })).toBeInTheDocument();
    expect(screen.getByText("Charolais cross · Male · 14 months")).toBeInTheDocument();
    expect(screen.getByText(/Demonstration herd\./)).toBeInTheDocument();
    expect(screen.getByText("521")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Record weight" })).toBeInTheDocument();
    expect(screen.getAllByText("Observation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cost record").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /View animal plan/ })).toHaveAttribute("href", "/cattle/animals/1427/plan");
    expect(screen.queryByText(/SYNTH-/)).toBeNull(); // no internal ids in the primary view
  });

  it("Record weight: sheet → save → engine recalculation → job resolves", async () => {
    wrap(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />);
    fireEvent.click(screen.getByRole("button", { name: "Record weight" }));
    const dialog = screen.getByRole("dialog", { name: /Record weight · 1427/ });
    fireEvent.change(within(dialog).getByLabelText("Scale reading"), { target: { value: "548" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save weight" }));
    });
    expect(loadCattleAnimal).toHaveBeenCalledWith({ version: 1, events: [expect.objectContaining({ kind: "RECORD_WEIGHT", tag: "1427", kg: 548, observedDate: null })] }, "1427", "STANDARD");
    expect(await screen.findByText(/closed by your new record/)).toBeInTheDocument();
    expect(screen.getByText("548")).toBeInTheDocument();
    expect(screen.getByText("No open jobs for this animal")).toBeInTheDocument();
  });

  it("the back-dated option says, before saving, that it won't close today's job", () => {
    render(<RecordWeightSheet open onClose={() => {}} onSave={() => {}} tag="1427" lastKg={521} asOfDate="2026-10-16" />);
    fireEvent.click(screen.getByRole("button", { name: "An earlier day" }));
    expect(screen.getByText(/doesn't close today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save weight" })).toBeDisabled(); // no date chosen yet
  });

  it("chart: keyboard and buttons move between weighings; conflicts show both readings", () => {
    const chart = demoAnimalView(EMPTY, "1438")!.profile.chart;
    render(<PerformanceChart chart={chart} />);
    expect(screen.getAllByText("498 kg or 512 kg").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Previous weighing" }));
    expect(screen.getAllByText("463 kg").length).toBe(2); // readout + accessible table
    fireEvent.keyDown(screen.getByRole("group", { name: /Weight history/ }), { key: "Home" });
    expect(screen.getAllByText("431 kg").length).toBe(2);
  });

  it("no weights: an honest empty chart, not a zero line", () => {
    render(<PerformanceChart chart={demoAnimalView(EMPTY, "1442")!.profile.chart} />);
    expect(screen.getByText(/No weights recorded yet/)).toBeInTheDocument();
  });

  it("unknown, conflict and no-goal states render their own labels", () => {
    wrap(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1455")!} tag="1455" scenario="STANDARD" />);
    expect(screen.getAllByText("Withdrawal unknown").length).toBeGreaterThan(0);
    expect(screen.queryByText("No withdrawal in force")).toBeNull();
  });

  it("planning-run failure is shown as a failure, never as 'nothing to do'", () => {
    wrap(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1427", "PLANNING_RUN_FAILURE")!} tag="1427" scenario="PLANNING_RUN_FAILURE" />);
    expect(screen.getByText(/couldn't work out this animal's jobs/)).toBeInTheDocument();
    expect(screen.queryByText("No open jobs for this animal")).toBeNull();
  });

  it("herd and group: group → animal navigation, per-animal counts, unresolved membership listed", () => {
    const herd = demoHerdView(EMPTY);
    const { unmount } = wrap(<HerdScreen initial={herd} scenario="STANDARD" />);
    expect(screen.getByRole("link", { name: /Finishers/ })).toHaveAttribute("href", "/cattle/groups/SYNTH-GROUP-FINISHERS");
    expect(screen.getAllByText(/3 animals need weighing/).length).toBeGreaterThan(0);
    unmount();
    wrap(<GroupScreen initial={herd} groupRef="SYNTH-GROUP-FINISHERS" scenario="STANDARD" />);
    expect(screen.getByRole("link", { name: /1427/ })).toHaveAttribute("href", "/cattle/animals/1427");
    expect(screen.getByText("Group records disagree")).toBeInTheDocument();
    expect(screen.getByText(/the work stays per animal/)).toBeInTheDocument();
  });

  it("animal plan: changing feed changes cost but not projected weight; the definition is disclosed", async () => {
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(await screen.findByText("609 kg")).toBeInTheDocument();
    expect(screen.getAllByText("+€195").length).toBe(2); // headline + breakdown row
    const feedBefore = screen.getByText("Forecast feed to sale").closest("div")!.textContent;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Increase Concentrate per day" }));
    });
    expect(screen.getByText("609 kg")).toBeInTheDocument();
    expect(screen.getByText("Forecast feed to sale").closest("div")!.textContent).not.toBe(feedBefore);
    expect(screen.getByText(/doesn't change the projected weight/)).toBeInTheDocument();
    expect(screen.getByText(/Development fixture — not live/)).toBeInTheDocument();
    expect(screen.queryByText(/^Profit$/)).toBeNull();
  });

  it("animal plan: invalid ordering is explained and saving is blocked", async () => {
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Planned housing date"), { target: { value: "2026-12-20" } });
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/housing date is on or after the sale date/);
    expect(screen.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });

  it("real-account state shows no synthetic data", () => {
    render(<CattleUnavailable />);
    expect(screen.getByText(/No canonical cattle records are connected/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/SYNTH|1427|€/);
  });

  it("navigation: Cattle is reachable and Livestock is unchanged", () => {
    expect(moreNavItems.find((i) => i.href === "/cattle")?.label).toBe("Cattle");
    expect(moreNavItems.find((i) => i.href === "/livestock")?.label).toBe("Livestock");
  });
});
