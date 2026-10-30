import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { SoilFieldCard } from "./SoilFieldCard";
import type { Farm, Field } from "@/domain/types";

const FARM: Farm = { id: "farm-1", name: "Test Farm", location: { county: "Cork", centroid: [0, 0] }, primaryEnterprises: [], units: "metric", ownerName: "Farmer" };

function field(overrides: Partial<Field> = {}): Field {
  return { id: "field-1", farmId: "farm-1", name: "Back Meadow", areaHa: 4.2, centroid: [0, 0], fertility: {}, ...overrides } as Field;
}

function verifiedField(): Field {
  return field({
    fertility: {
      pIndex: { value: 3, status: "verified", source: "Southern Agri Labs soil test", sourceDate: "2026-06-01" },
      kIndex: { value: 2, status: "verified", source: "Southern Agri Labs soil test", sourceDate: "2026-06-01" },
      pH: { value: 6.4, status: "verified", source: "Southern Agri Labs soil test", sourceDate: "2026-06-01" },
      verifiedTest: { sampleDate: "2026-06-01", laboratory: "Southern Agri Labs", sampleRef: "SAL-2026-0113", p: 6.72, k: 88.4, pH: 6.4 },
    },
  });
}

function renderCard(f: Field) {
  render(<FarmProvider initialState={{ farm: FARM, fields: [f], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}><SoilFieldCard field={f} /></FarmProvider>);
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("SoilFieldCard — overview only", () => {
  it("does not expose duplicate P/K or soil-test write controls", () => {
    renderCard(field());
    expect(screen.queryByText(/P Index \(assumption\)/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /add soil test|add new test/i })).toBeNull();
    expect(screen.getByRole("link", { name: /open field recommendation setup/i }).getAttribute("href")).toBe("/fields?field=field-1&chapter=nutrients");
  });

  it("shows the canonical lab-derived soil status without re-entering it", () => {
    renderCard(verifiedField());
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("6.4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /view evidence/i })).toBeTruthy();
  });

  it("opens the saved laboratory evidence read-only", () => {
    renderCard(verifiedField());
    fireEvent.click(screen.getByRole("button", { name: /view evidence/i }));
    const dialog = screen.getByRole("dialog");
    const content = within(dialog);
    expect(content.getByText("SAL-2026-0113")).toBeTruthy();
    expect(content.getByText("Southern Agri Labs")).toBeTruthy();
    expect(content.getByText("6.72 mg/L")).toBeTruthy();
    expect(content.getByText("88.4 mg/L")).toBeTruthy();
  });

  it("shows honest absence when no laboratory result exists", () => {
    renderCard(field());
    expect(screen.getByText(/no laboratory soil test is recorded/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view evidence/i })).toBeNull();
  });
});
