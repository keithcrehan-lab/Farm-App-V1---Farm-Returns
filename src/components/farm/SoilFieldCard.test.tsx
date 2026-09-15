import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmProvider, useFields } from "@/store/farm-store";
import { SoilFieldCard } from "./SoilFieldCard";
import type { Farm, Field } from "@/domain/types";

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: [],
  units: "metric",
  ownerName: "Farmer",
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

/** Reads the field back from the live store (not a static prop) so a
 * submitted soil test's real, post-classification stored value can be
 * observed after `addSoilTest` mutates state — the same live-field
 * source `SoilPageClient`'s own real usage of this card would supply. */
function Harness({ fieldId }: { fieldId: string }) {
  const fields = useFields();
  const liveField = fields.find((f) => f.id === fieldId)!;
  return (
    <>
      <SoilFieldCard field={liveField} />
      <pre data-testid="debug-fertility">{JSON.stringify(liveField.fertility)}</pre>
    </>
  );
}

function renderCard(f: Field) {
  return render(
    <FarmProvider initialState={{ farm: FARM, fields: [f], livestockGroups: [], housing: [], slurryAllocations: [] }}>
      <Harness fieldId={f.id} />
    </FarmProvider>,
  );
}

function fillAndSubmit(values: { laboratory: string; sampleRef: string; date: string; pH: string; p: string; k: string }) {
  const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
  const [phEl, pEl, kEl] = inputs;
  fireEvent.change(screen.getByPlaceholderText(/Southern Agri Labs/i), { target: { value: values.laboratory } });
  fireEvent.change(screen.getByPlaceholderText(/SAL-2026-0113/i), { target: { value: values.sampleRef } });
  fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: values.date } });
  fireEvent.change(phEl, { target: { value: values.pH } });
  fireEvent.change(pEl, { target: { value: values.p } });
  fireEvent.change(kEl, { target: { value: values.k } });
  fireEvent.submit(pEl.closest("form")!);
}

beforeEach(() => {
  // FarmProvider's own mock-mode rehydration reads real window.localStorage
  // post-mount — without clearing it, a later test's fresh `initialState`
  // would be silently overwritten by an earlier test's persisted state.
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("SoilFieldCard — Add soil test form numeric precision", () => {
  it("accepts 2-decimal-place values on the pH/P/K inputs — step=0.01, not 0.1", () => {
    renderCard(field());
    fireEvent.click(screen.getByText("Add soil test"));

    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const [phEl, pEl, kEl] = inputs;
    expect(phEl.step).toBe("0.01");
    expect(pEl.step).toBe("0.01");
    expect(kEl.step).toBe("0.01");
  });

  it("carries a real, exact 2-decimal P value the browser's own step attribute previously blocked (8.16) through unrounded to the stored verifiedTest", () => {
    renderCard(field());
    fireEvent.click(screen.getByText("Add soil test"));
    fillAndSubmit({ laboratory: "Test Lab", sampleRef: "REF-1", date: "2026-09-15", pH: "6.34", p: "8.16", k: "112.73" });

    const debug = JSON.parse(screen.getByTestId("debug-fertility").textContent!);
    expect(debug.verifiedTest.p).toBe(8.16);
    expect(debug.verifiedTest.k).toBe(112.73);
    expect(debug.pH.value).toBe(6.34);
  });

  it("classifies P Index from the full, unrounded value — a real statutory-boundary value (8.01) only reachable at 2-decimal precision resolves the same conservative AMBIGUOUS_STATUTORY_BOUNDARY treatment the domain engine already defines, never silently rounded away to a different band", () => {
    renderCard(field());
    fireEvent.click(screen.getByText("Add soil test"));
    fillAndSubmit({ laboratory: "Test Lab", sampleRef: "REF-2", date: "2026-09-15", pH: "6.5", p: "8.01", k: "50" });

    const debug = JSON.parse(screen.getByTestId("debug-fertility").textContent!);
    expect(debug.verifiedTest.p).toBe(8.01);
    expect(debug.pIndex.value).toBe(4);
    expect(debug.pIndex.source).toMatch(/AMBIGUOUS_STATUTORY_BOUNDARY/);
  });

  it("still rejects an incomplete submission (a required field left blank) — existing validation is unchanged", () => {
    renderCard(field());
    fireEvent.click(screen.getByText("Add soil test"));

    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const [phEl, pEl, kEl] = inputs;
    // Laboratory deliberately left blank — handleSubmit's own pre-existing
    // `if (!sampleDate || !laboratory.trim() || !sampleRef.trim()) return;`
    // guard, untouched by this fix.
    fireEvent.change(screen.getByPlaceholderText(/SAL-2026-0113/i), { target: { value: "REF-3" } });
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: "2026-09-15" } });
    fireEvent.change(phEl, { target: { value: "6.5" } });
    fireEvent.change(pEl, { target: { value: "8" } });
    fireEvent.change(kEl, { target: { value: "50" } });
    fireEvent.submit(pEl.closest("form")!);

    const debug = JSON.parse(screen.getByTestId("debug-fertility").textContent!);
    expect(debug.verifiedTest).toBeUndefined();
  });
});

/** A field with a real, already-verified soil test — same shape
 * `addSoilTest`/`addSoilTestToField` actually persist. */
function fieldWithVerifiedTest(overrides: Partial<Field> = {}): Field {
  return field({
    fertility: {
      pIndex: { value: 3, status: "verified", source: "Southern Agri Labs soil test", sourceDate: "2026-06-01" },
      kIndex: { value: 2, status: "verified", source: "Southern Agri Labs soil test", sourceDate: "2026-06-01" },
      pH: { value: 6.4, status: "verified", source: "Southern Agri Labs soil test", sourceDate: "2026-06-01" },
      verifiedTest: {
        sampleDate: "2026-06-01",
        laboratory: "Southern Agri Labs",
        sampleRef: "SAL-2026-0113",
        p: 6.72,
        k: 88.4,
        pH: 6.4,
      },
    },
    ...overrides,
  });
}

describe("SoilFieldCard — View test", () => {
  it("root cause fixed: the 'View test' control is a real, enabled button, not a disabled placeholder", () => {
    renderCard(fieldWithVerifiedTest());
    const button = screen.getByRole("button", { name: /view test/i });
    expect(button.tagName).toBe("BUTTON");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("title")).not.toBe("Full test report viewer is a future refinement");
  });

  it("clicking 'View test' opens the real, saved soil-test record for this field — sample reference, date, pH, P, K, derived indices and status", () => {
    renderCard(fieldWithVerifiedTest());
    fireEvent.click(screen.getByRole("button", { name: /view test/i }));

    const dialog = screen.getByRole("dialog");
    const inDialog = within(dialog);
    expect(inDialog.getByText("SAL-2026-0113")).toBeTruthy(); // sample reference
    expect(inDialog.getByText("1 Jun 2026")).toBeTruthy(); // test date
    expect(inDialog.getByText("Southern Agri Labs")).toBeTruthy();
    expect(inDialog.getByText("6.4")).toBeTruthy(); // pH
    expect(inDialog.getByText("6.72")).toBeTruthy(); // P mg/l, full 2dp precision
    expect(inDialog.getByText("88.4")).toBeTruthy(); // K mg/l
    expect(inDialog.getByText("3")).toBeTruthy(); // derived P Index
    expect(inDialog.getByText("2")).toBeTruthy(); // derived K Index
    expect(inDialog.getAllByText("Verified").length).toBeGreaterThan(0); // verification/status
  });

  it("is keyboard-accessible — a real <button>, closable via Escape, focus lands inside the dialog", () => {
    renderCard(fieldWithVerifiedTest());
    fireEvent.click(screen.getByRole("button", { name: /view test/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows no active 'View test' action when the field has no valid saved soil test", () => {
    renderCard(field()); // empty fertility — no verifiedTest
    expect(screen.queryByRole("button", { name: /view test/i })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
  // F6/F10) — the "View test" sheet must offer a real, reachable link
  // into the same Scientific Evidence Report the GPS-guided sampling
  // flow already produces, keyed by this field's own id.
  it("offers a real 'View scientific evidence report' link, pointed at this field's own evidence report route", () => {
    renderCard(fieldWithVerifiedTest());
    fireEvent.click(screen.getByRole("button", { name: /view test/i }));
    const link = within(screen.getByRole("dialog")).getByRole("link", { name: /view scientific evidence report/i });
    expect(link.getAttribute("href")).toBe(`/evidence-report/field/${fieldWithVerifiedTest().id}`);
  });
});

// Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
// F4) — "Allow a new dated laboratory result on an already-tested
// field. Preserve history and make the active result clear."
describe("SoilFieldCard — new lab result on an already-tested field", () => {
  it("offers a real 'Add new test' action once a test already exists — never blocks a second, dated real result", () => {
    renderCard(fieldWithVerifiedTest());
    expect(screen.getByRole("button", { name: /add new test/i })).toBeTruthy();
  });

  it("preserves the previously-active real test as real history when a new one is submitted — never silently discarded", () => {
    renderCard(fieldWithVerifiedTest());
    fireEvent.click(screen.getByRole("button", { name: /add new test/i }));
    fillAndSubmit({ laboratory: "New Lab Co", sampleRef: "NL-2026-9001", date: "2026-09-10", pH: "6.6", p: "7.15", k: "95.3" });

    const debug = JSON.parse(screen.getByTestId("debug-fertility").textContent!);
    // The new test is now the real active one.
    expect(debug.verifiedTest.sampleRef).toBe("NL-2026-9001");
    expect(debug.verifiedTest.p).toBe(7.15);
    // The real previous test is chained, not discarded.
    expect(debug.verifiedTest.previous.sampleRef).toBe("SAL-2026-0113");
    expect(debug.verifiedTest.previous.p).toBe(6.72);
  });

  // Codex audit round 1 HIGH — a real backfilled OLDER result must never
  // silently demote the genuinely newer, already-active test out of
  // `fertility`'s own current pIndex/kIndex/pH (the observed regression:
  // every new entry became active purely by entry order, regardless of
  // its own real sampleDate).
  it("never lets a backfilled OLDER real result become the active test — active pIndex/kIndex/verifiedTest stay on the genuinely newer one", () => {
    renderCard(fieldWithVerifiedTest());
    fireEvent.click(screen.getByRole("button", { name: /add new test/i }));
    // Active test on file is dated 2026-06-01 — this submission is an
    // older, backfilled real result (e.g. a delayed lab report).
    fillAndSubmit({ laboratory: "Backfill Labs", sampleRef: "BF-2025-0001", date: "2025-11-01", pH: "6.0", p: "5.0", k: "80.0" });

    const debug = JSON.parse(screen.getByTestId("debug-fertility").textContent!);
    // The real active test is genuinely unchanged.
    expect(debug.verifiedTest.sampleRef).toBe("SAL-2026-0113");
    expect(debug.verifiedTest.p).toBe(6.72);
    expect(debug.pIndex.sourceDate).toBe("2026-06-01");
    // The backfilled older result is real history, not discarded.
    expect(debug.verifiedTest.previous.sampleRef).toBe("BF-2025-0001");
  });

  it("makes the active result clear and shows real prior test history in the 'View test' sheet", () => {
    const withHistory = fieldWithVerifiedTest({
      fertility: {
        pIndex: { value: 4, status: "verified", source: "New Lab Co soil test", sourceDate: "2026-09-10" },
        kIndex: { value: 3, status: "verified", source: "New Lab Co soil test", sourceDate: "2026-09-10" },
        pH: { value: 6.6, status: "verified", source: "New Lab Co soil test", sourceDate: "2026-09-10" },
        verifiedTest: {
          sampleDate: "2026-09-10",
          laboratory: "New Lab Co",
          sampleRef: "NL-2026-9001",
          p: 7.15,
          k: 95.3,
          pH: 6.6,
          previous: {
            sampleDate: "2026-06-01",
            laboratory: "Southern Agri Labs",
            sampleRef: "SAL-2026-0113",
            p: 6.72,
            k: 88.4,
            pH: 6.4,
          },
        },
      },
    });
    renderCard(withHistory);
    fireEvent.click(screen.getByRole("button", { name: /view test/i }));

    const dialog = screen.getByRole("dialog");
    const inDialog = within(dialog);
    // The active result is the new one.
    expect(inDialog.getByText("NL-2026-9001")).toBeTruthy();
    // Real prior history is shown, distinctly, not merged into the
    // active figures.
    expect(inDialog.getByText(/1 earlier test on file/i)).toBeTruthy();
    expect(inDialog.getByText(/SAL-2026-0113/)).toBeTruthy();
  });
});
