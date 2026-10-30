import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FarmProvider, useFields } from "@/store/farm-store";
import { FieldSoilTestEditor } from "./FieldSoilTestEditor";
import type { Farm, Field } from "@/domain/types";

const FARM: Farm = { id: "farm-1", name: "Test Farm", location: { county: "Cork", centroid: [0, 0] }, primaryEnterprises: [], units: "metric", ownerName: "Farmer" };
function field(overrides: Partial<Field> = {}): Field { return { id: "field-1", farmId: "farm-1", name: "Back Meadow", areaHa: 4.2, centroid: [0, 0], fertility: {}, ...overrides } as Field; }
function Harness({ fieldId }: { fieldId: string }) { const live = useFields().find((f) => f.id === fieldId)!; return <><FieldSoilTestEditor field={live} /><pre data-testid="fertility">{JSON.stringify(live.fertility)}</pre></>; }
function renderEditor(f: Field) { render(<FarmProvider initialState={{ farm: FARM, fields: [f], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}><Harness fieldId={f.id} /></FarmProvider>); }
function fill(values: { date?: string; lab?: string; ref?: string; ph?: string; p?: string; k?: string }) {
  if (values.date !== undefined) fireEvent.change(screen.getByLabelText("Sample date"), { target: { value: values.date } });
  if (values.lab !== undefined) fireEvent.change(screen.getByLabelText("Laboratory"), { target: { value: values.lab } });
  if (values.ref !== undefined) fireEvent.change(screen.getByLabelText("Sample reference"), { target: { value: values.ref } });
  if (values.ph !== undefined) fireEvent.change(screen.getByLabelText("pH"), { target: { value: values.ph } });
  if (values.p !== undefined) fireEvent.change(screen.getByLabelText("P (mg/L)"), { target: { value: values.p } });
  if (values.k !== undefined) fireEvent.change(screen.getByLabelText("K (mg/L)"), { target: { value: values.k } });
}
function submit() { fireEvent.click(screen.getByRole("button", { name: /save laboratory result/i })); }

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("FieldSoilTestEditor — canonical soil write path", () => {
  it("keeps two-decimal laboratory precision", () => {
    renderEditor(field());
    expect((screen.getByLabelText("pH") as HTMLInputElement).step).toBe("0.01");
    expect((screen.getByLabelText("P (mg/L)") as HTMLInputElement).step).toBe("0.01");
    expect((screen.getByLabelText("K (mg/L)") as HTMLInputElement).step).toBe("0.01");
    fill({ date: "2026-09-15", lab: "Test Lab", ref: "REF-1", ph: "6.34", p: "8.16", k: "112.73" });
    submit();
    const fertility = JSON.parse(screen.getByTestId("fertility").textContent!);
    expect(fertility.verifiedTest.p).toBe(8.16);
    expect(fertility.verifiedTest.k).toBe(112.73);
    expect(fertility.pH.value).toBe(6.34);
  });

  it("keeps conservative statutory boundary classification on the unrounded P value", () => {
    renderEditor(field());
    fill({ date: "2026-09-15", lab: "Test Lab", ref: "REF-2", ph: "6.5", p: "8.01", k: "50" });
    submit();
    const fertility = JSON.parse(screen.getByTestId("fertility").textContent!);
    expect(fertility.pIndex.value).toBe(4);
    expect(fertility.pIndex.source).toMatch(/AMBIGUOUS_STATUTORY_BOUNDARY/);
  });

  it("does not save an incomplete lab result", () => {
    renderEditor(field());
    fill({ date: "2026-09-15", ref: "REF-3", ph: "6.5", p: "8", k: "50" });
    fireEvent.submit(screen.getByRole("form", { name: /laboratory soil test/i }));
    expect(JSON.parse(screen.getByTestId("fertility").textContent!).verifiedTest).toBeUndefined();
    expect(screen.getByText(/sample date, laboratory and sample reference are required/i)).toBeTruthy();
  });

  it("allows a newer result and preserves the previous test", () => {
    const existing = field({ fertility: { pIndex: { value: 3, status: "verified", source: "Old Lab soil test", sourceDate: "2026-06-01" }, kIndex: { value: 2, status: "verified", source: "Old Lab soil test", sourceDate: "2026-06-01" }, pH: { value: 6.4, status: "verified", source: "Old Lab soil test", sourceDate: "2026-06-01" }, verifiedTest: { sampleDate: "2026-06-01", laboratory: "Old Lab", sampleRef: "OLD-1", p: 6.72, k: 88.4, pH: 6.4 } } });
    renderEditor(existing);
    fireEvent.click(screen.getByRole("button", { name: /add newer lab test/i }));
    fill({ date: "2026-09-10", lab: "New Lab", ref: "NEW-1", ph: "6.6", p: "7.15", k: "95.3" });
    submit();
    const fertility = JSON.parse(screen.getByTestId("fertility").textContent!);
    expect(fertility.verifiedTest.sampleRef).toBe("NEW-1");
    expect(fertility.verifiedTest.previous.sampleRef).toBe("OLD-1");
  });
});
