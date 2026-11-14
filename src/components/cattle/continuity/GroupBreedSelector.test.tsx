import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyBreedDraft, groupBreedValue, type BreedDraft,
} from "@/domain/cattle/group-breed-selection";
import { GroupBreedSelector } from "./GroupBreedSelector";
import { useState } from "react";

function Harness({ initial = emptyBreedDraft() }: { initial?: BreedDraft }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <GroupBreedSelector value={value} onChange={setValue} />
      <output data-testid="breed-result">{groupBreedValue(value) ?? "unknown"}</output>
    </>
  );
}

afterEach(cleanup);

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Breed" }));
}

describe("searchable cattle breed selector", () => {
  it("remains compact until tapped and chooses a common breed", () => {
    render(<Harness />);
    expect(screen.queryByRole("searchbox", { name: "Search cattle breeds" })).toBeNull();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "One breed" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Cattle breed options" })).getByRole("button", { name: "Angus" }));
    expect(screen.getByTestId("breed-result")).toHaveTextContent("Angus");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("searchbox", { name: "Search cattle breeds" })).toBeNull();
    expect(screen.getByRole("button", { name: "Breed" })).toHaveTextContent("Angus");
  });

  it("searches and records a Limousin × Angus cross, without a forced equal fraction", () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Crossbred" }));
    const search = screen.getByRole("searchbox", { name: "Search cattle breeds" });
    fireEvent.change(search, { target: { value: "Limous" } });
    fireEvent.click(screen.getByRole("button", { name: "Limousin" }));
    fireEvent.change(search, { target: { value: "Angus" } });
    fireEvent.click(screen.getByRole("button", { name: "Angus" }));
    expect(screen.getByTestId("breed-result")).toHaveTextContent("Limousin × Angus");
    expect(screen.getByTestId("breed-result").textContent).not.toContain("50%");
  });

  it("supports unlisted breeds, mixed groups, unknown and complex crosses", () => {
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "One breed" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cattle breeds" }), { target: { value: "Unlisted breed" } });
    fireEvent.click(screen.getByRole("button", { name: /Use “Unlisted breed” as breed/ }));
    expect(screen.getByTestId("breed-result")).toHaveTextContent("Unlisted breed");
    fireEvent.click(screen.getByRole("radio", { name: "Mixed group" }));
    expect(screen.getByTestId("breed-result")).toHaveTextContent("Mixed breeds");
    fireEvent.click(screen.getByRole("radio", { name: "Not known" }));
    expect(screen.getByTestId("breed-result")).toHaveTextContent("unknown");
    fireEvent.click(screen.getByRole("radio", { name: "Other / complex cross" }));
    fireEvent.change(screen.getByLabelText(/Describe the cross/), { target: { value: "Angus × Limousin × Hereford" } });
    expect(screen.getByTestId("breed-result")).toHaveTextContent("Complex cross: Angus × Limousin × Hereford");
  });

  it("does not permit editing when disabled", () => {
    const onChange = vi.fn();
    render(<GroupBreedSelector value={emptyBreedDraft()} onChange={onChange} disabled />);
    expect(screen.getByRole("button", { name: "Breed" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
