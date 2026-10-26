import fs from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Living Animal Record — the signed-in individual animal page. Real-shaped rows run through the real service (the
 * frozen engines at one viewpoint), then the redesigned screen renders them. Checks the truth rules (unknown is never
 * 0, no invented health / goal / location / economics), D16 gating, the five lenses, the Growth graph and History
 * reading real evidence, and Record Weight through the redesigned sheet (the server action's own security and
 * idempotency are covered end-to-end in `src/server/cattle-real/real-write.test.tsx`).
 */

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));
vi.mock("@/lib/farm-data/cattle-source", () => ({ readCattleSourceForCurrentFarm: vi.fn() }));
const recordRealCattleWeight = vi.fn();
vi.mock("@/app/(app)/cattle/real-actions", () => ({ recordRealCattleWeight: (...a: unknown[]) => recordRealCattleWeight(...a) }));

import type { LivestockGroup } from "@/domain/types";
import type { LivestockIndividualRow, WeightObservationRow } from "@/lib/farm-data/row-types";
import { RealAnimalProfileScreen } from "@/components/cattle/AnimalProfileScreen";
import { REAL_MODE_CAPABILITIES, REAL_NOTES, evaluateRealCattle, realAnimalView, type RealAnimalView } from "@/server/cattle-real/real-service";
import { livingRecordOf } from "@/server/cattle-real/living-record";

const F = "f0000000-0000-4000-8000-00000000000a";
const G = "6a000000-0000-4000-8000-000000000001";
const TEST = "a1000000-0000-4000-8000-000000000001";
const UNWEIGHED = "a1000000-0000-4000-8000-000000000002";
const VP = { effectiveAt: "2026-10-25T12:00:00Z", knowledgeCutoff: "2026-10-25T12:00:00Z" };
const VP_LATER = { effectiveAt: "2026-10-26T09:00:00Z", knowledgeCutoff: "2026-10-26T09:00:00Z" };

const UNSUPPORTED_WORDING = /Complete programme treatment|programme treatment due|declared veterinary programme|Record proof of a requirement|need(s)? proof recorded|Check withdrawal status|withdrawal check|Set a production goal|ha(s|ve) no goal/i;
/** Claims the page may never make without evidence. */
const FAKE_CLAIMS = /No withdrawal in force|withdrawal[- ]free|\bis healthy\b|\bcompliant\b|No medicines recorded|No recorded requirement applies|On track|Projected \d/i;

const group: LivestockGroup = { id: G, farmId: F, category: "weanling", label: "Weanlings", count: { value: 20, status: "verified", source: "Owner" }, system: "grazing", value: { value: 0, status: "estimated", source: "Farm Return assumption" } };
const animal = (id: string, tag: string): LivestockIndividualRow => ({ id, farm_id: F, group_id: G, tag_number: tag, category: "steer", sex: "male", breed: "Belgian Blue", date_of_birth: "2019-02-01", goal_status: null, notes: null, created_at: "2026-10-24T08:00:00+00:00", updated_at: "2026-10-24T08:00:00+00:00" });
const weight = (id: string, kg: number, date: string): WeightObservationRow => ({ id, farm_id: F, animal_id: TEST, weight_kg: kg, observed_date: date, source: "Farmer entered", created_at: `${date}T09:00:00+00:00` });
const W1 = weight("c0000000-0000-4000-8000-000000000001", 600, "2026-10-24");
const W2 = weight("c0000000-0000-4000-8000-000000000002", 601, "2026-10-25");

function viewOf(id: string, weights: WeightObservationRow[] = [W1, W2], vp = VP): RealAnimalView {
  const r = evaluateRealCattle({ farmId: F, groups: [group], animals: [animal(TEST, "test"), animal(UNWEIGHED, "IE 2")], weights }, vp);
  if (!r.ok) throw new Error(r.reason);
  return realAnimalView(r.evaluation, id)!;
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const panel = (id: string) => document.getElementById(`lens-panel-${id}`)!;
const fact = (key: string) => document.querySelector(`[data-fact="${key}"]`)!;

beforeEach(() => {
  refresh.mockReset();
  recordRealCattleWeight.mockReset();
  window.history.replaceState(null, "", "/cattle/animals/x");
});
afterEach(() => cleanup());

describe("Living Animal Record — real identity and measurement", () => {
  it("renders the animal's real identity first, its latest recorded weight and gain", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    expect(screen.getByRole("heading", { level: 1, name: "test" })).toBeInTheDocument();
    expect(screen.getByText("Belgian Blue · Male · 7 yr 8 mo")).toBeInTheDocument();
    const masthead = screen.getByRole("banner");
    expect(within(masthead).getByText("601")).toBeInTheDocument();
    expect(masthead.querySelector('[data-weight-state="KNOWN"]')).not.toBeNull();
    expect(within(masthead).getByText(/kg\/day/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Weanlings" })).toHaveAttribute("href", `/cattle/groups/${G}`);
    expect(document.querySelector('[data-cattle-mode="REAL"]')).not.toBeNull();
  });

  it("an unweighed animal's weight is its state, never 0 kg", () => {
    render(<RealAnimalProfileScreen view={viewOf(UNWEIGHED)} />);
    const masthead = screen.getByRole("banner");
    expect(masthead.querySelector('[data-weight-state="NONE"]')).not.toBeNull();
    expect(within(masthead).getByText("Not weighed yet")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/(^|[^\d.])0(\.0+)?\s?kg\b/);
    expect(within(fact("weight") as HTMLElement).getByText("—")).toBeInTheDocument();
  });

  it("the portrait is a designed plate that says no photo is stored — never a stock photograph", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    expect(screen.getByRole("img", { name: /test: Photos aren't stored in Farm Return yet/ })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("Living Animal Record — truth rules", () => {
  it("no fake health state: medicine records, programmes and requirements are Not stored, withdrawal Unknown", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    const rows = Object.fromEntries([...document.querySelectorAll("[data-health-row]")].map((r) => [r.getAttribute("data-health-row"), r.textContent]));
    expect(rows.withdrawal).toMatch(/Unknown$/);
    expect(rows.medicines).toMatch(/Not stored$/);
    expect(rows.programmes).toMatch(/Veterinary programmes.*Couldn't be checked.*Not stored$/);
    expect(rows.requirements).toMatch(/Requirements.*Not stored$/);
    expect(screen.getByText("Health status unknown")).toBeInTheDocument();
    expect(screen.getByText(REAL_NOTES.health)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(FAKE_CLAIMS);
  });

  it("no fake goal, target line or projection: the planned outcome and production target stay not recorded", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    expect(within(fact("target") as HTMLElement).getByText("—")).toBeInTheDocument();
    expect(within(panel("plan")).getByText("Not recorded")).toBeInTheDocument();
    expect(within(panel("plan")).getByText(REAL_NOTES.goal)).toBeInTheDocument();
    expect(document.querySelector('[data-growth-target="NOT_RECORDED"]')).not.toBeNull();
    expect(within(panel("growth")).getByText("Target not recorded")).toBeInTheDocument();
    expect(panel("growth").textContent).not.toMatch(/Goal \d|Projected/);
  });

  it("no fake location and no invented economics", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    expect(within(fact("location") as HTMLElement).getByText("—")).toBeInTheDocument();
    for (const k of ["value", "hold", "sale", "return"]) expect(document.querySelector(`[data-economics="${k}"] strong`)!.textContent).toBe("—");
    expect(panel("plan").textContent).not.toMatch(/€\s?[1-9]/);
    expect(screen.getByText(/costs are unknown — not €0/)).toBeInTheDocument();
  });

  it("D16: no unsupported job appears; a weighed animal has no open work, an unweighed one only Record weight", () => {
    const { unmount } = render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_WORDING);
    expect(within(fact("work") as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(document.querySelector('[data-work-state="ITEMS"]')).toBeNull();
    unmount();
    render(<RealAnimalProfileScreen view={viewOf(UNWEIGHED)} />);
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_WORDING);
    expect(within(fact("work") as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weigh now" })).toBeInTheDocument();
  });

  it("the record statements follow the capability table, never the animal (a stored capability shows the engine's records)", () => {
    const v = viewOf(TEST);
    expect(v.record.health.state).toBe("NOT_STORED");
    const allStored = livingRecordOf(v.profile, { ...REAL_MODE_CAPABILITIES, healthRecords: true, veterinaryProgrammes: true, obligations: true, productionGoals: true }, REAL_NOTES);
    expect(allStored.health.state).toBe("FROM_RECORDS");
    expect(allStored.coverage.find((c) => c.label === "Health")!.value).not.toBe("Not stored");
  });
});

describe("Living Animal Record — lenses", () => {
  it("opens on Overview; every chapter is selectable by tap and by arrow key", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    expect(tab(/Overview/)).toHaveAttribute("aria-selected", "true");
    expect(panel("overview")).not.toHaveAttribute("hidden");
    for (const id of ["growth", "health", "plan", "history"]) expect(panel(id)).toHaveAttribute("hidden");
    for (const [name, id] of [[/Growth/, "growth"], [/Health/, "health"], [/Plan/, "plan"], [/History/, "history"], [/Overview/, "overview"]] as const) {
      fireEvent.click(tab(name));
      expect(tab(name)).toHaveAttribute("aria-selected", "true");
      expect(panel(id)).not.toHaveAttribute("hidden");
    }
    fireEvent.keyDown(tab(/Overview/), { key: "ArrowRight" });
    expect(tab(/Growth/)).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab(/Growth/), { key: "ArrowLeft" });
    expect(tab(/Overview/)).toHaveAttribute("aria-selected", "true");
  });

  it("Growth reads the real weight history and inspects a point", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    fireEvent.click(tab(/Growth/));
    const g = panel("growth");
    const rows = within(g).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toEqual(["25 Oct 2026601 kgMethod not recorded", "24 Oct 2026600 kgMethod not recorded"].reverse());
    const note = document.getElementById("growth-annotation")!;
    expect(note).toHaveTextContent("25 OCT 2026");
    expect(note).toHaveTextContent("601 kg");
    fireEvent.click(within(g).getByRole("button", { name: "Previous weighing" }));
    expect(document.getElementById("growth-annotation")).toHaveTextContent("600 kg");
    fireEvent.keyDown(within(g).getByRole("group", { name: /Weight history/ }), { key: "End" });
    expect(document.getElementById("growth-annotation")).toHaveTextContent("601 kg");
  });

  it("History lists the real evidence and filters / searches it", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    fireEvent.click(tab(/History/));
    const h = panel("history");
    const families = () => [...h.querySelectorAll("li[data-family]")].map((li) => li.getAttribute("data-family"));
    expect(families().filter((f) => f === "WEIGHT")).toHaveLength(2);
    expect(families()).toContain("MANAGEMENT");
    expect(families().every((f) => f === "WEIGHT" || f === "MANAGEMENT")).toBe(true);
    fireEvent.click(within(h).getByRole("button", { name: /^Weight/ }));
    expect(families()).toEqual(["WEIGHT", "WEIGHT"]);
    fireEvent.click(within(h).getByRole("button", { name: /^All/ }));
    fireEvent.change(within(h).getByRole("searchbox"), { target: { value: "weanlings" } });
    expect(families()).toEqual(["MANAGEMENT"]);
    expect(within(h).getByText(/Showing 1 of 3 records/)).toBeInTheDocument();
  });

  it("the context rail uses real identity and coverage, and can recede", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    const rail = screen.getByRole("complementary", { name: "Record context" });
    expect(within(rail).getByText("Belgian Blue")).toBeInTheDocument();
    expect(within(rail).getByText("2 records")).toBeInTheDocument();
    expect(within(rail).getAllByText("Not stored").length).toBeGreaterThan(0);
    const toggle = screen.getByRole("button", { name: "Record context" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(rail).toHaveAttribute("inert");
  });
});

describe("Living Animal Record — Record Weight through the redesigned sheet", () => {
  it("sends one exact request to the existing server action, closes, opens Growth, refreshes, and shows the new weighing", async () => {
    const view = viewOf(TEST);
    let resolve: (v: unknown) => void = () => {};
    recordRealCattleWeight.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { rerender } = render(<RealAnimalProfileScreen view={view} />);
    fireEvent.click(screen.getByRole("button", { name: "Record weight" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/saved with the method not recorded/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).toBeNull(); // no fake method selector (D12)
    const input = within(dialog).getByLabelText("Weight");
    expect(input).toHaveValue("601");
    fireEvent.click(within(dialog).getByRole("button", { name: "Plus 5 kilograms" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Plus 1 kilogram" }));
    expect(input).toHaveValue("607");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save weight" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Saving…" }));
    expect(recordRealCattleWeight).toHaveBeenCalledTimes(1);
    const sent = recordRealCattleWeight.mock.calls[0][0] as { requestId: string; animalId: string; weightText: string; observedDate: string | null };
    expect(Object.keys(sent).sort()).toEqual(["animalId", "observedDate", "requestId", "weightText"]);
    expect(sent).toMatchObject({ animalId: TEST, weightText: "607", observedDate: null });
    await act(async () => resolve({ ok: true, observationId: sent.requestId, replayed: false }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(tab(/Growth/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Weight saved");

    // The server re-read: the engines now hold the new row.
    rerender(<RealAnimalProfileScreen view={viewOf(TEST, [W1, W2, weight(sent.requestId, 607, "2026-10-26")], VP_LATER)} />);
    expect(within(screen.getByRole("banner")).getByText("607")).toBeInTheDocument();
    expect(document.getElementById("growth-annotation")).toHaveTextContent("607 kg");
    expect(document.getElementById("growth-annotation")).toHaveTextContent("Recorded just now");
    expect(within(panel("history")).getByText("Recorded just now")).toBeInTheDocument();
  });

  it("a refusal keeps the sheet open with the reading and the server's message; nothing refreshes", async () => {
    recordRealCattleWeight.mockResolvedValue({ ok: false, reason: "FUTURE_DATE", message: "The date can't be later than today." });
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    fireEvent.click(screen.getByRole("button", { name: "Record weight" }));
    fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "610" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weight" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The date can't be later than today."));
    expect(screen.getByLabelText("Weight")).toHaveValue("610");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("an invalid reading is refused before it is sent", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    fireEvent.click(screen.getByRole("button", { name: "Record weight" }));
    fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "-5" } });
    expect(screen.getByRole("button", { name: "Save weight" })).toBeDisabled();
    expect(recordRealCattleWeight).not.toHaveBeenCalled();
  });
});

describe("Living Animal Record — demo / real isolation", () => {
  it("renders without the demonstration session and reaches no demonstration module", () => {
    render(<RealAnimalProfileScreen view={viewOf(TEST)} />);
    expect(document.body.textContent).not.toMatch(/Demonstration herd|browser session|SYNTH/);
    const dir = path.join(__dirname);
    for (const f of fs.readdirSync(dir).filter((x) => /\.tsx?$/.test(x) && !x.includes(".test."))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src).not.toMatch(/cattle-demo|session\/|useCattleDemoSession|AnimalPhotos/);
    }
  });
});
