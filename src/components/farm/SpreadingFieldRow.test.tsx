import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SpreadingFieldRow } from "./SpreadingFieldRow";
import { checkClosedPeriodCalendar } from "@/domain/closed-period-calendar";
import { mockFields, mockSpreadingScores } from "@/data/mock-farm";

afterEach(() => {
  cleanup();
});

const field = mockFields[0];
const entry = mockSpreadingScores[0];

describe("SpreadingFieldRow — real closed-period calendar status (V3 closure pass)", () => {
  it("shows 'Under validation' when no calendar status is supplied (component's own safe default)", () => {
    render(<SpreadingFieldRow field={field} entry={entry} />);
    expect(screen.getByText("Under validation")).toBeTruthy();
  });

  it("shows the real 'Open' status for a date outside the statutory closed period", () => {
    const status = checkClosedPeriodCalendar({ county: "Cork", date: "2026-06-15", material: "chemical_fertiliser" });
    expect(status.status).toBe("OK");
    render(<SpreadingFieldRow field={field} entry={entry} calendarStatus={status} />);
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.queryByText("Under validation")).toBeNull();
  });

  it("shows the real 'Closed period' status for a date inside the statutory closed period, never silently defaulting to Open", () => {
    const status = checkClosedPeriodCalendar({ county: "Cork", date: "2026-10-01", material: "chemical_fertiliser" });
    expect(status.status).toBe("LEGAL_PROHIBITION");
    render(<SpreadingFieldRow field={field} entry={entry} calendarStatus={status} />);
    expect(screen.getByText("Closed period")).toBeTruthy();
    expect(screen.queryByText("Open")).toBeNull();
  });

  it("shows 'Unknown' rather than a false Open/Closed for an unmapped county", () => {
    const status = checkClosedPeriodCalendar({ county: "Not A Real County", date: "2026-06-15", material: "chemical_fertiliser" });
    expect(status.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    render(<SpreadingFieldRow field={field} entry={entry} calendarStatus={status} />);
    expect(screen.getByText("Unknown")).toBeTruthy();
  });
});
