/**
 * Cattle C10 — strict audit 59009 (`.agent/campaigns/cattle-engine-v1/audits/audit-20261023T114455Z-59009.md`):
 * F015 a second C5 target comparison hidden behind the first, F016 numeric fields stripping characters into
 * another number, F017 a per-head mart price written per kilogram, F018 focus escaping the cattle sheet.
 * Every case runs the real path (frozen C5, the real valuation boundary, the rendered components); the two
 * repeated families — unowned first-item selection and input sanitisation — also get structural guards.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: vi.fn(() => new Promise(() => {})), projectCattleWeight: vi.fn(() => new Promise(() => {})), loadCattleHerd: vi.fn(() => new Promise(() => {})) }));

import { valueAnimalAtMart, type MartComparable } from "@/domain/animal-plan";
import {
  NUMERIC_FIELDS,
  TARGET_DISPLAY,
  buildAnimalProfile,
  MEMBERSHIP_DISPLAY,
  animalRow,
  numericInputValue,
  parseNumericInput,
  planScreenView,
  saleWithdrawalNotices,
  seal,
  stepNumericInput,
  unseal,
  type CattleOutputs,
  type WithdrawalVM,
} from "@/domain/cattle/presentation";
import { DEMO_PERFORMANCE_TARGETS } from "@/server/cattle-demo/demo-catalogue";
import { outputsWithTargets } from "@/server/cattle-demo/c10-engine-fixtures";
import { animalIdOf } from "@/server/cattle-demo/demo-herd";
import { DEMO_MART_PROVIDER, DEMO_MART_STALE_AFTER_DAYS } from "@/server/cattle-demo/demo-economics";
import { DEMO_DIRECTORY, animalViewFrom, demoAnimalView } from "@/server/cattle-demo/demo-service";
import type { CattleDemoSession } from "./session/demo-session";
import { CattleDemoSessionProvider } from "./session/CattleDemoSessionProvider";
import { AnimalPlanScreen } from "./AnimalPlanScreen";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { RecordWeightSheet } from "./RecordWeightSheet";
import type { LatestWeightVM } from "@/domain/cattle/presentation";

const EMPTY: CattleDemoSession = { version: 1, events: [] };
afterEach(() => cleanup());

const T = "1427"; // recent daily gain ≈ 1.08 kg/day
const ID = animalIdOf(T);
const costsOf = (tag: string) => unseal(demoAnimalView(EMPTY, tag)!.plan.inputs).costs;
const profileOf = (o: CattleOutputs) => buildAnimalProfile(o, ID, DEMO_DIRECTORY, costsOf(T));
const base = DEMO_PERFORMANCE_TARGETS[0] as Record<string, unknown>;
const adg = (targetId: string, valueKgPerDay: number, extra: Record<string, unknown> = {}) => ({ ...base, targetId, metric: { kind: "ADG", valueKgPerDay }, ...extra });

// ---------------------------------------------------------------------------
describe("F015 — every C5 target comparison is kept; no first-item headline", { timeout: 120_000 }, () => {
  const states = (o: CattleOutputs) => o.performance!.animals.find((a) => a.animalId === ID)!.comparisons.map((c) => [c.targetId, c.state]);

  it("one target: its own state, value and source", () => {
    const o = outputsWithTargets(T, [adg("TGT-A", 1)]);
    expect(states(o)).toEqual([["TGT-A", "ON_TRACK"]]);
    const p = profileOf(o);
    expect(p.performanceState.code).toBe("TARGET:ON_TRACK");
    expect(p.target).toMatchObject({ summary: null, label: "Target 1.00 kg/day (band 0.90 kg/day – 1.10 kg/day)" });
    expect([...p.target.comparisons]).toHaveLength(1);
  });

  it("two targets that agree: the shared state, said across both, both listed", () => {
    const o = outputsWithTargets(T, [adg("TGT-A", 1), adg("TGT-B", 1.05)]);
    expect(states(o)).toEqual([["TGT-A", "ON_TRACK"], ["TGT-B", "ON_TRACK"]]);
    const p = profileOf(o);
    expect(p.performanceState.code).toBe("TARGET:ON_TRACK");
    expect(p.target.summary).toBe("On track across 2 targets");
    expect(p.target.label).toBeNull();
    expect([...p.target.comparisons].map((c) => c.state.code)).toEqual(["TARGET:ON_TRACK", "TARGET:ON_TRACK"]);
  });

  it.each([
    ["ON_TRACK + BEHIND", [adg("TGT-A", 1), adg("TGT-B", 1.5)], [["TGT-A", "ON_TRACK"], ["TGT-B", "BEHIND"]]],
    ["BEHIND + ON_TRACK (ids reordered)", [adg("TGT-A", 1.5), adg("TGT-B", 1)], [["TGT-A", "BEHIND"], ["TGT-B", "ON_TRACK"]]],
    ["ON_TRACK + EVIDENCE_CONFLICT (two live versions of one target)", [adg("TGT-A", 1), adg("TGT-B", 1, { version: "v1" }), adg("TGT-B", 1.2, { version: "v2" })], [["TGT-A", "ON_TRACK"], ["TGT-B", "EVIDENCE_CONFLICT"]]],
    ["ON_TRACK + TARGET_UNVERIFIED (not reviewed for production)", [adg("TGT-A", 1), adg("TGT-B", 1, { reviewState: "DRAFT" })], null],
  ] as const)("%s: MIXED headline, every comparison visible on profile and herd — never the first one's state", (_name, targets, expected) => {
    const o = outputsWithTargets(T, targets as never);
    if (expected) expect(states(o)).toEqual(expected);
    const comparisons = o.performance!.animals.find((a) => a.animalId === ID)!.comparisons;
    expect(new Set(comparisons.map((c) => c.state)).size).toBe(2);
    const p = profileOf(o);
    expect(p.performanceState).toEqual(TARGET_DISPLAY.MIXED);
    expect(p.target.summary).toBe("2 targets with different results — each is listed below");
    expect([...p.target.comparisons].map((c) => c.state.code)).toEqual(comparisons.map((c) => `TARGET:${c.state}`));
    // The herd row reads the same headline (never the first comparison).
    expect(animalRow(o, ID, DEMO_DIRECTORY, MEMBERSHIP_DISPLAY.MEMBER).performance).toEqual(TARGET_DISPLAY.MIXED);
    // Rendered: the summary and each target with its own state.
    const view = animalViewFrom(o, ID, costsOf(T));
    render(
      <CattleDemoSessionProvider>
        <AnimalProfileScreen initial={view} tag={T} scenario="STANDARD" />
      </CattleDemoSessionProvider>,
    );
    const list = screen.getByRole("list", { name: "Target comparisons" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    for (const c of p.target.comparisons) expect(list.textContent).toContain(c.state.label);
    expect(screen.getByText("Mixed target results")).toBeInTheDocument();
  });

  it("a conflicting target's source names the disagreement, never another version's source", () => {
    const p = profileOf(outputsWithTargets(T, [adg("TGT-B", 1, { version: "v1" }), adg("TGT-B", 1.2, { version: "v2" })]));
    expect(p.performanceState.code).toBe("TARGET:EVIDENCE_CONFLICT");
    expect([...p.target.comparisons][0]).toMatchObject({ label: "Target: versions disagree", source: "2 versions of this target disagree" });
    expect(p.target.source).toBe("2 versions of this target disagree");
  });

  it("no target: the owner's no-target state, no comparison invented", () => {
    const p = profileOf(outputsWithTargets(T, []));
    expect(p.performanceState.code).toBe("TARGET:NO_TARGET");
    expect([...p.target.comparisons]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("CL-011 — every food product's withdrawal is kept (C3: one gate entry per queried product)", () => {
  const w = (product: string, code: string, until: string | null = null): WithdrawalVM => ({ state: { code, label: code, tone: "neutral", detail: null }, label: code, until, untilLabel: null, product });

  it("a clear first product never hides a second product in withdrawal or unknown", () => {
    const notices = saleWithdrawalNotices([w("Meat", "WITHDRAWAL:CLEAR"), w("Milk", "WITHDRAWAL:IN_WITHDRAWAL", "2026-11-20T00:00:00Z"), w("Offal", "WITHDRAWAL:UNKNOWN")], "2026-11-10");
    expect(notices.map((n) => n.tone)).toEqual(["risk", "unknown"]);
    expect(notices[0].text).toContain("(milk)");
    expect(notices[1].text).toContain("(offal)");
  });

  it("the demo's one food product reads as before (one row, one notice)", () => {
    const p = demoAnimalView(EMPTY, "1455")!.profile;
    expect([...p.health.withdrawals].map((x) => x.product)).toEqual(["Meat"]);
  });
});

// ---------------------------------------------------------------------------
describe("F016 — farmer numbers are accepted or refused, never rewritten", () => {
  const W = NUMERIC_FIELDS.WEIGHT_KG;
  const A = NUMERIC_FIELDS.PLAN_AMOUNT;

  it.each([
    ["52.1", W, "52.1"],
    ["52,1", W, "52.1"],
    ["0.35", A, "0.35"],
    ["0,35", A, "0.35"],
    [" 548.24 ", W, "548.24"],
    ["0", A, "0"],
  ] as const)("%s is valid as %s", (raw, spec, canonical) => {
    expect(parseNumericInput(raw, spec)).toEqual({ state: "VALID", canonical });
  });

  it.each([
    ["-12", W, "NEGATIVE"],
    ["-0,35", A, "NEGATIVE"],
    ["1e3", W, "SYNTAX"],
    ["12abc", W, "SYNTAX"],
    ["1.2.3", W, "SYNTAX"],
    [",,", W, "SYNTAX"],
    ["1,2.3", W, "SYNTAX"],
    ["1,000", A, "GROUPED"],
    ["1,000,000", A, "GROUPED"],
    ["1.000,5", A, "GROUPED"],
    ["0", W, "OUT_OF_RANGE"],
    ["2000.01", W, "OUT_OF_RANGE"],
    ["548.245", W, "TOO_PRECISE"],
  ] as const)("%s is refused (%s), never another number", (raw, spec, reason) => {
    const r = parseNumericInput(raw, spec);
    expect(r).toMatchObject({ state: "INVALID", reason });
    expect(numericInputValue(r)).toBeNull();
  });

  it("the thousands message tells the farmer what to do", () => {
    expect(parseNumericInput("1,000", A)).toMatchObject({ message: "Enter the number without a thousands separator." });
  });

  it("precision (F007): 548.24 + 5 = 553.24; a comma entry steps exactly; a malformed entry is never overwritten by a stepper", () => {
    expect(stepNumericInput("548.24", "5", W)).toBe("553.24");
    expect(stepNumericInput("548,24", "5", W)).toBe("553.24");
    expect(stepNumericInput("", "5", W, "548.24")).toBe("553.24");
    expect(stepNumericInput("-12", "5", W)).toBeNull();
    expect(stepNumericInput("1e3", "5", W)).toBeNull();
    expect(stepNumericInput("3", "-5", W)).toBe("3"); // never stepped onto an exclusive 0 kg
  });

  const KNOWN: LatestWeightVM = { state: "KNOWN", kg: 521, observedAt: "2026-09-14T09:00:00Z", basis: { kind: "MEASURED", methodLabel: "Scale", caption: "Weighed 14 Sep", stateLabel: "Weighed" }, recordIds: [] } as never;

  it.each([
    ["-12", null],
    ["1e3", null],
    ["52,1", 52.1],
    ["1,000", null],
  ] as const)("Record Weight: typing %s keeps the text and saves %s", async (typed, saved) => {
    const onSave = vi.fn(() => null);
    render(<RecordWeightSheet open onClose={() => {}} onSave={onSave} tag={T} previous={KNOWN} asOfDate="2026-10-16" />);
    await act(async () => {});
    const input = screen.getByLabelText("Scale reading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: typed } });
    expect(input.value).toBe(typed);
    fireEvent.submit(input.closest("form")!);
    if (saved === null) {
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-invalid", "true");
    } else {
      expect(onSave).toHaveBeenCalledWith({ kg: saved, observedDate: null });
    }
  });

  it("Animal Plan: '0,35' is 0.35 for the economics; '-12' and '1,000' stay as typed and refuse with a message", async () => {
    const view = demoAnimalView(EMPTY, T)!;
    render(
      <CattleDemoSessionProvider>
        <AnimalPlanScreen initial={view} tag={T} scenario="STANDARD" />
      </CattleDemoSessionProvider>,
    );
    const field = screen.getByLabelText("Forage / grazing") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "0,35" } });
    expect(field.value).toBe("0,35");
    expect(field).toHaveAttribute("aria-invalid", "false");
    for (const [typed, message] of [
      ["-12", "Enter a number above zero."],
      ["1,000", "Enter the number without a thousands separator."],
      ["1e3", "Enter a number, like 52.1 or 52,1."],
    ] as const) {
      fireEvent.change(field, { target: { value: typed } });
      expect(field.value).toBe(typed);
      expect(screen.getAllByText(new RegExp(message.replace(/[.,]/g, "\\$&"))).length).toBeGreaterThan(0);
    }
    // The economics see the parsed value, never a stripped one ("0,35" → 0.35, not 35).
    const vm = planScreenView({ inputs: view.plan.inputs, assumptions: { ...view.plan.defaults, forageCostPerDay: "0,35" }, martId: view.plan.defaultMartId, projection: undefined, profile: view.profile });
    const vmDot = planScreenView({ inputs: view.plan.inputs, assumptions: { ...view.plan.defaults, forageCostPerDay: "0.35" }, martId: view.plan.defaultMartId, projection: undefined, profile: view.profile });
    expect([...vm.rows].find((r) => r.key === "forecastFeedCost")!.value).toEqual([...vmDot.rows].find((r) => r.key === "forecastFeedCost")!.value);
    const bad = planScreenView({ inputs: view.plan.inputs, assumptions: { ...view.plan.defaults, forageCostPerDay: "-12" }, martId: view.plan.defaultMartId, projection: undefined, profile: view.profile });
    expect([...bad.issues]).toContain("Forage / grazing: Enter a number above zero.");
    expect(bad.saveBlocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("F017 — a mart price keeps its own basis", () => {
  const view = demoAnimalView(EMPTY, T)!;
  const inputs = unseal(view.plan.inputs);
  const request = { animalId: ID, martId: view.plan.defaultMartId, liveweightKg: 521, sex: "MALE" as const, breedLabel: "Charolais cross", ageMonths: 14, asOfDate: "2026-10-16" };
  const perKg = DEMO_MART_PROVIDER.findComparable(request);
  if (perKg.state !== "AVAILABLE") throw new Error(perKg.state);
  const perHead: MartComparable = { ...perKg.comparable, basis: "EUR_PER_HEAD", observedLow: "1800", observedHigh: "2200", central: "2000" };
  const planWith = (comparable: MartComparable) => {
    const valuation = valueAnimalAtMart({ state: "AVAILABLE", comparable }, request, DEMO_MART_STALE_AFTER_DAYS);
    return planScreenView({ inputs: seal({ ...inputs, valuations: { ...inputs.valuations, [request.martId]: valuation } }), assumptions: view.plan.defaults, martId: request.martId, projection: { state: "PROJECTED", saleDate: view.plan.defaults.saleDate, kg: 609, adgKgPerDay: 1.08, fromObservedAt: "2026-09-14T09:00:00Z", assumptions: [] }, profile: view.profile });
  };

  it("€/head: ranges per head, no '/kg', no '× projected weight', the projected sale value unknown with its reason", () => {
    const vm = planWith(perHead);
    if (vm.market.state !== "ESTIMATED") throw new Error(vm.market.state);
    expect(vm.market.priceRange).toBe("(€1,800/head – €2,200/head)");
    expect(vm.market.basis).toMatch(/^€\/head as reported/);
    expect(JSON.stringify(vm.market)).not.toContain("/kg");
    const sale = [...vm.rows].find((r) => r.key === "projectedSaleValue")!;
    expect(sale.hint).toBeNull();
    expect(sale.value).toEqual({ state: "UNKNOWN", text: "Unknown — a per-head price can't be moved to a new weight" });
    expect([...vm.rows].find((r) => r.key === "currentEstimatedValue")!.value).toMatchObject({ state: "KNOWN", text: "€2,000" });
  });

  it("€/kg: ranges per kg and the weight-based hint", () => {
    const vm = planWith(perKg.comparable);
    if (vm.market.state !== "ESTIMATED") throw new Error(vm.market.state);
    expect(vm.market.priceRange).toMatch(/^\(€\d+\.\d{2}\/kg – €\d+\.\d{2}\/kg\)$/);
    expect([...vm.rows].find((r) => r.key === "projectedSaleValue")!.hint).toMatch(/\/kg × projected weight$/);
  });
});

// ---------------------------------------------------------------------------
describe("F018 — the Record Weight sheet is the shared, focus-trapped Sheet", () => {
  const KNOWN: LatestWeightVM = { state: "KNOWN", kg: 521, observedAt: "2026-09-14T09:00:00Z", basis: { kind: "MEASURED", methodLabel: "Scale", caption: "Weighed 14 Sep", stateLabel: "Weighed" }, recordIds: [] } as never;
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Open sheet
        </button>
        <button type="button">Behind the sheet</button>
        <RecordWeightSheet open={open} onClose={() => setOpen(false)} onSave={() => null} tag={T} previous={KNOWN} asOfDate="2026-10-16" />
      </div>
    );
  }
  const focusable = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));

  it("focus enters, Tab and Shift+Tab stay inside, Escape closes, focus returns to the trigger", async () => {
    render(<Host />);
    const trigger = screen.getByText("Open sheet");
    trigger.focus();
    fireEvent.click(trigger);
    await act(async () => {});
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const items = focusable(dialog);
    items.at(-1)!.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(items.at(-1));
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

// ---------------------------------------------------------------------------
describe("structural guards — the two repeated families can't come back unnoticed", () => {
  const ROOT = process.cwd();
  const filesIn = (dir: string, ext: RegExp): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesIn(join(dir, d.name), ext) : ext.test(d.name) && !/\.test\./.test(d.name) ? [join(dir, d.name)] : []));

  it("no cattle component strips, coerces or parses typed numbers itself (the shared parser does)", () => {
    const offenders = filesIn("src/components/cattle", /\.tsx?$/).flatMap((f) => {
      const src = readFileSync(join(ROOT, f), "utf8");
      return [/\.value\.replace\(/, /\.replace\(\/\[\^/, /\bparseFloat\(/, /\bparseInt\(/, /\bNumber\(/, /\bvalueAsNumber\b/, /type="number"/].filter((re) => re.test(src)).map((re) => `${f}: ${re}`);
    });
    expect(offenders).toEqual([]);
  });

  it("every first-item read in C10 presentation is a guarded singleton or a documented owner order", () => {
    const offenders = filesIn("src/domain/cattle/presentation", /\.ts$/)
      .filter((f) => !f.endsWith("format.ts")) // regex capture groups / date parts, not collections
      .flatMap((f) => {
        const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
        return lines.flatMap((line, i) => {
          if (/^\s*(\*|\/\/|\/\*)/.test(line) && !/first-item:/.test(line)) return []; // comments
          if (!/\[0\]|\.at\(0\)|\.slice\(0, ?1\)/.test(line)) return [];
          const ok = /(length|size) === 1/.test(line) || /first-item:/.test(line) || /first-item:/.test(lines[i - 1] ?? "");
          return ok ? [] : [`${f}:${i + 1}: ${line.trim()}`];
        });
      });
    expect(offenders).toEqual([]);
  });
});
