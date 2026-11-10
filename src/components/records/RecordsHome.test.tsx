import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/farm-records", () => ({
  confirmBookNotUsedAction: vi.fn(async () => ({ ok: true, on: "2026-11-10" })),
  saveFeedRecordAction: vi.fn(async () => ({ ok: false, error: "Add how much arrived." })),
  savePesticideJobAction: vi.fn(),
  saveSprayOperatorAction: vi.fn(),
}));

import { RecordsHome, type RecordsHomeProps } from "./RecordsHome";

afterEach(cleanup);

const props: RecordsHomeProps = {
  today: "2026-11-10", signedIn: true, unavailable: [], notUsed: {}, operators: [], feed: [],
  fields: [{ id: "f1", name: "Home Field", areaHa: 4.2 }], groups: [{ id: "g1", name: "Weanlings" }],
  dates: { medicines: ["2026-09-01"], movements: ["2026-10-01"] },
  diary: [
    { id: "a", book: "movements", date: "2026-10-01", title: "Moved Weanlings into Home Field", detail: "24 head · still there" },
    { id: "b", book: "medicines", date: "2026-09-01", title: "Bought Ivomec", detail: "Qty 1" },
  ],
};

describe("RecordsHome", () => {
  it("shows readiness for both packs, the diary, and quick entry", () => {
    render(<RecordsHome {...props} />);
    expect(screen.getByText("Bord Bia SBLAS")).toBeTruthy();
    expect(screen.getByText("Nitrates")).toBeTruthy();
    expect(screen.getByText("Moved Weanlings into Home Field")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add feed/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add spray/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/calculation version/i);
  });

  it("filters the diary by book", () => {
    render(<RecordsHome {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Medicines/ }));
    expect(screen.queryByText("Moved Weanlings into Home Field")).toBeNull();
    expect(screen.getByText("Bought Ivomec")).toBeTruthy();
  });

  it("opens the feed form and shows the save error in plain words", async () => {
    render(<RecordsHome {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Add feed/ }));
    const dialog = screen.getByRole("dialog", { name: "Add feed" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save feed record" }));
    expect(await within(dialog).findByText("Add how much arrived.")).toBeTruthy();
  });
});
