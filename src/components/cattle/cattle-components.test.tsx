import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const loadCattleAnimal = vi.fn();
const projectCattleWeight = vi.fn();
const loadCattleHerd = vi.fn();
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: (...a: unknown[]) => loadCattleAnimal(...a), projectCattleWeight: (...a: unknown[]) => projectCattleWeight(...a), loadCattleHerd: (...a: unknown[]) => loadCattleHerd(...a) }));

import { WEIGHT_BASIS_DISPLAY, weightBasisOf, type LatestWeightVM } from "@/domain/cattle/presentation";
import { demoAnimalView, demoHerdView, demoProjection } from "@/server/cattle-demo/demo-service";
import { AnimalPlanScreen } from "./AnimalPlanScreen";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { CattleUnavailable } from "./CattleUnavailable";
import { moreNavItems } from "@/components/shell/nav-items";
import { GroupScreen, HerdScreen } from "./HerdScreens";
import { PerformanceChart } from "./PerformanceChart";
import { RecordWeightSheet } from "./RecordWeightSheet";
import { CattleDemoSessionProvider, useCattleDemoSession } from "./session/CattleDemoSessionProvider";
import { useDemoView } from "./session/use-demo-view";
import type { CattleDemoSession } from "./session/demo-session";

const EMPTY: CattleDemoSession = { version: 1, events: [] };
const KNOWN_521: LatestWeightVM = { state: "KNOWN", kg: 521, observedAt: "2026-09-14T10:00:00Z", basis: weightBasisOf("MEASURED", "SCALE"), display: WEIGHT_BASIS_DISPLAY.MEASURED };
const wrap = (ui: React.ReactNode) => render(<CattleDemoSessionProvider>{ui}</CattleDemoSessionProvider>);

beforeEach(() => {
  loadCattleAnimal.mockImplementation(async (session: CattleDemoSession, tag: string, scenario?: "STANDARD") => ({ ok: true, value: demoAnimalView(session, tag, scenario) }));
  projectCattleWeight.mockImplementation(async (session: CattleDemoSession, tag: string, date: string, scenario?: "STANDARD") => ({ ok: true, value: demoProjection(session, tag, date, scenario) }));
  loadCattleHerd.mockImplementation(async (session: CattleDemoSession, scenario?: "STANDARD") => ({ ok: true, value: demoHerdView(session, scenario) }));
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
    expect(screen.getByText("No open jobs for this animal")).toBeInTheDocument(); // a 32-day-old weight raises no work (no staleness rule)
    expect(screen.getAllByText("Observation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cost record").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /View animal plan/ })).toHaveAttribute("href", "/cattle/animals/1427/plan");
    expect(screen.queryByText(/SYNTH-/)).toBeNull(); // no internal ids in the primary view
  });

  it("Record weight: sheet → save → engine recalculation → job resolves", async () => {
    wrap(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1442")!} tag="1442" scenario="STANDARD" />);
    expect(screen.getByRole("heading", { level: 3, name: "Record weight" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record weight" }));
    const dialog = screen.getByRole("dialog", { name: /Record weight · 1442/ });
    fireEvent.change(within(dialog).getByLabelText("Scale reading"), { target: { value: "400" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save weight" }));
    });
    expect(loadCattleAnimal).toHaveBeenCalledWith({ version: 1, events: [expect.objectContaining({ kind: "RECORD_WEIGHT", tag: "1442", kg: 400, observedDate: null })] }, "1442", "STANDARD");
    expect(await screen.findByText(/closed by your new record/)).toBeInTheDocument();
    expect(screen.getAllByText("400").length).toBeGreaterThan(0);
    expect(screen.getByText("No open jobs for this animal")).toBeInTheDocument();
  });

  it("the back-dated option says, before saving, that it won't close today's job", () => {
    render(<RecordWeightSheet open onClose={() => {}} onSave={() => null} tag="1427" previous={KNOWN_521} asOfDate="2026-10-16" />);
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
    expect(screen.getAllByText(/2 animals need weighing/).length).toBeGreaterThan(0);
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

  it("animal plan: a retained animal is told, before saving, that its goal type will change", async () => {
    const tag = "1452";
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, tag)!} tag={tag} scenario="STANDARD" />);
    });
    expect(screen.getByText("Saving changes 1452's goal from keep on farm to finishing.")).toBeInTheDocument();
  });

  it("record-weight sheet focuses the scale reading first", async () => {
    render(<RecordWeightSheet open onClose={() => {}} onSave={() => null} tag="1427" previous={KNOWN_521} asOfDate="2026-10-16" />);
    // The shared Sheet focuses its panel in a microtask, then the sheet hands focus to the scale reading.
    await act(async () => {});
    expect(document.activeElement).toBe(screen.getByLabelText("Scale reading"));
  });

  it("planning-run failure: the plan says a record couldn't be read, not that weights are missing", async () => {
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427", "PLANNING_RUN_FAILURE")!} tag="1427" scenario="PLANNING_RUN_FAILURE" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(screen.getAllByText(/a weight record couldn't be read/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/needs two usable weights/)).toBeNull();
  });

  it("animal plan: a sale date inside the medicine withdrawal is flagged", async () => {
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, "1447")!} tag="1447" scenario="STANDARD" />);
    });
    expect(screen.queryByText(/inside the medicine withdrawal/)).toBeNull(); // goal date 18 Dec is after it
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Planned sale date"), { target: { value: "2026-10-28" } });
    });
    expect(screen.getByText(/inside the medicine withdrawal \(meat\), which runs until 30 Oct 2026/)).toBeInTheDocument();
  });

  it("planning-run failure: health says programmes couldn't be checked, never 'not in any programme' (audit F005)", () => {
    wrap(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1427", "PLANNING_RUN_FAILURE")!} tag="1427" scenario="PLANNING_RUN_FAILURE" />);
    expect(screen.getAllByText(/^Couldn't be checked$/)).toHaveLength(2); // programmes and requirements, each its own row
    expect(screen.getAllByText(/The evaluation didn't run, so their status is unknown\./).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Not in any declared veterinary programme/)).toBeNull();
    expect(screen.getByText(/Not shown: weighings/)).toBeInTheDocument();
  });

  it("record-weight sheet submits the reading unchanged (audit F007)", () => {
    const onSave = vi.fn(() => null);
    render(<RecordWeightSheet open onClose={() => {}} onSave={onSave} tag="1427" previous={KNOWN_521} asOfDate="2026-10-16" />);
    fireEvent.change(screen.getByLabelText("Scale reading"), { target: { value: "548.24" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weight" }));
    expect(onSave).toHaveBeenCalledWith({ kg: 548.24, observedDate: null });
  });

  it("save plan → leave → reopen → save keeps the saved target, not the original (audit F008)", async () => {
    const Spy = () => {
      const s = useCattleDemoSession();
      return <span data-testid="events">{JSON.stringify(s.session.events)}</span>;
    };
    const Harness = ({ show }: { show: boolean }) => (
      <CattleDemoSessionProvider>
        <Spy />
        {show ? <AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" /> : null}
      </CattleDemoSessionProvider>
    );
    const { rerender } = render(<Harness show />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Target weight (goal)"), { target: { value: "620" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    });
    rerender(<Harness show={false} />);
    await act(async () => {
      rerender(<Harness show />);
    });
    expect(screen.getByLabelText("Target weight (goal)")).toHaveValue("620");
    expect(screen.getByText("Saved to this demo session")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    });
    const events = JSON.parse(screen.getByTestId("events").textContent!) as { kind: string; targetKg: number }[];
    expect(events.map((e) => [e.kind, e.targetKg])).toEqual([["SAVE_PLAN_GOAL", 620], ["SAVE_PLAN_GOAL", 620]]);
  });

  it("changing scenario shows that scenario's herd at once, and a late response for an old key is dropped (audit F009)", async () => {
    const { rerender } = wrap(<HerdScreen initial={demoHerdView(EMPTY)} scenario="STANDARD" />);
    expect(screen.getByText(/12 animals in 2 groups/)).toBeInTheDocument();
    rerender(
      <CattleDemoSessionProvider>
        <HerdScreen initial={demoHerdView(EMPTY, "EMPTY_HERD")} scenario="EMPTY_HERD" />
      </CattleDemoSessionProvider>,
    );
    expect(screen.queryByText(/12 animals/)).toBeNull();
    expect(screen.getByText(/^No animals recorded · /)).toBeInTheDocument();
    expect(screen.getByText(/^There are no animals in this herd yet\./)).toBeInTheDocument();
  });

  it("useDemoView drops a late response for a superseded key", async () => {
    const resolvers: Record<string, (v: { ok: true; value: string }) => void> = {};
    const Probe = ({ id }: { id: string }) => {
      const { view, pending } = useDemoView(`initial-${id}`, id, () => new Promise((r) => (resolvers[id] = r)));
      return <span data-testid="probe">{`${view}|${pending}`}</span>;
    };
    const Add = () => {
      const s = useCattleDemoSession();
      return <button type="button" onClick={() => s.addEvent({ kind: "RECORD_WEIGHT", tag: "1427", kg: 530, observedDate: null })}>add</button>;
    };
    const ui = (id: string) => (
      <CattleDemoSessionProvider>
        <Add />
        <Probe id={id} />
      </CattleDemoSessionProvider>
    );
    const { rerender } = render(ui("A"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "add" }));
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("initial-A|true");
    rerender(ui("B")); // identity changes before A's response arrives
    await act(async () => {
      resolvers.A({ ok: true, value: "stale-A" });
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("initial-B|true"); // A's late answer is ignored
    await act(async () => {
      resolvers.B({ ok: true, value: "fresh-B" });
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("fresh-B|false");
  });

  it("a full session refuses saves and says so — no success message (audit F010)", async () => {
    const Fill = () => {
      const s = useCattleDemoSession();
      return (
        <button type="button" onClick={() => { for (let i = 0; i < 40; i++) s.addEvent({ kind: "RECORD_WEIGHT", tag: "1431", kg: 500 + i, observedDate: null }); }}>
          fill
        </button>
      );
    };
    loadCattleAnimal.mockImplementation(() => new Promise(() => {})); // keep the view as is; this test is about the refusal
    projectCattleWeight.mockImplementation(async (session: CattleDemoSession, tag: string, date: string) => ({ ok: true, value: demoProjection(EMPTY, tag, date) }));
    render(
      <CattleDemoSessionProvider>
        <Fill />
        <AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />
      </CattleDemoSessionProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "fill" }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Target weight (goal)"), { target: { value: "630" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/session is full, so the plan wasn't saved/);
    expect(screen.queryByText(/Saved to this demo session/)).toBeNull();
    expect(screen.getByLabelText("Target weight (goal)")).toHaveValue("630");
  });

  it("a refused save of an UNCHANGED plan is reported too — never silent, never 'saved' (audit F010)", async () => {
    const Fill = () => {
      const s = useCattleDemoSession();
      return (
        <button type="button" onClick={() => { for (let i = 0; i < 40; i++) s.addEvent({ kind: "RECORD_WEIGHT", tag: "1431", kg: 500 + i, observedDate: null }); }}>
          fill
        </button>
      );
    };
    loadCattleAnimal.mockImplementation(() => new Promise(() => {}));
    render(
      <CattleDemoSessionProvider>
        <Fill />
        <AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />
      </CattleDemoSessionProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "fill" }));
    });
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save plan" })); // the defaults, untouched
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/session is full, so the plan wasn't saved/);
    expect(screen.queryByText(/Saved to this demo session/)).toBeNull();
    // Editing afterwards clears the refusal (the next save attempt reports its own outcome).
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Target weight (goal)"), { target: { value: "650" } });
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("a successful save says so, and only then (audit F010)", async () => {
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />);
    });
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Saved to this demo session — the goal now uses this date and weight/)).toBeInTheDocument();
  });

  it("unknown housing: housing figures say why they're unknown; an explicit assumption enables a marked scenario; removing it withdraws it (audit F011)", async () => {
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, "1433")!} tag="1433" scenario="STANDARD" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const row = (label: string) => screen.getByText(label).closest("div")!.textContent ?? "";
    expect(screen.getByText(/Can't calculate housing costs yet — the animal's current housing status isn't recorded/)).toBeInTheDocument();
    expect(row("Forecast housing to sale")).toMatch(/Unknown — the animal's current housing status isn't known/);
    expect(row("Projected direct profit at sale")).toMatch(/current housing status isn't known/);
    expect(screen.getByText(/housing now unknown, so days at grass and housed aren.t split/)).toBeInTheDocument(); // the timeline doesn't split unknown housing
    expect(screen.queryByText("Assumed housing")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Outdoors now" }));
    });
    expect(row("Forecast housing to sale")).toMatch(/€/);
    expect(row("Forecast housing to sale")).toMatch(/Assumed housing/);
    expect(row("Projected direct profit at sale")).toMatch(/Assumed housing/);
    expect(row("Forecast feed to sale")).not.toMatch(/Assumed housing/); // feed doesn't depend on housing
    expect(screen.getByText(/Housing figures below use your assumption — the record isn't changed/)).toBeInTheDocument();
    expect(screen.getByText(/\(assumed housing\)/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Housed now" }));
    });
    expect(screen.getByText("Assumed housed now, so housing costs run every day to sale.")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "No assumption" }));
    });
    expect(row("Forecast housing to sale")).toMatch(/current housing status isn't known/);
    expect(screen.queryByText("Assumed housing")).toBeNull();
  });

  it("recorded housing never shows the assumption control", async () => {
    await act(async () => {
      wrap(<AnimalPlanScreen initial={demoAnimalView(EMPTY, "1427")!} tag="1427" scenario="STANDARD" />);
    });
    expect(screen.queryByRole("button", { name: "Outdoors now" })).toBeNull();
    expect(screen.queryByText("Assumed housing")).toBeNull();
  });

  it("record-weight refusal keeps the sheet open with the reading", () => {
    render(<RecordWeightSheet open onClose={() => {}} onSave={() => "This demonstration session is full, so the weight wasn't recorded."} tag="1427" previous={KNOWN_521} asOfDate="2026-10-16" />);
    fireEvent.change(screen.getByLabelText("Scale reading"), { target: { value: "549" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weight" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/weight wasn't recorded/);
    expect(screen.getByLabelText("Scale reading")).toHaveValue("549");
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
