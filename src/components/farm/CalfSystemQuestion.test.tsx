import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const save = vi.fn(async (v: string) => ({ ok: true as const, v }));
vi.mock("@/app/actions/calf-system", () => ({ setFarmCalfSystemAction: (v: string) => save(v) }));
import { CalfSystemQuestion } from "./CalfSystemQuestion";

describe("CalfSystemQuestion", () => {
  it("asks in plain words and saves the farmer's answer", async () => {
    const onSaved = vi.fn();
    render(<CalfSystemQuestion value={null} onSaved={onSaved} />);
    expect(screen.getByText("What do you usually do with the calves?")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Sell them as weanlings/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("SUCKLER_CALF_TO_WEANING"));
    expect(save).toHaveBeenCalledWith("SUCKLER_CALF_TO_WEANING");
    expect(screen.getByRole("radio", { name: /Sell them as weanlings/ }).getAttribute("aria-checked")).toBe("true");
  });
  it("says plainly when the answer means no grass nitrogen figure", () => {
    render(<CalfSystemQuestion value="OTHER_DRYSTOCK" />);
    expect(screen.getByText(/won.t get a nitrogen figure/)).toBeTruthy();
  });
});
