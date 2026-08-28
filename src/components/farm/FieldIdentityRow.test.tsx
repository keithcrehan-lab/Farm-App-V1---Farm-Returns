import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldIdentityRow } from "./FieldIdentityRow";
import { mockFields } from "@/data/mock-farm";

describe("FieldIdentityRow (used atop Nutrient Planner / Silage Planning)", () => {
  it("renders the field identity without a spreading-score badge on the thumbnail", () => {
    const field = mockFields[0];
    render(<FieldIdentityRow field={field} />);
    expect(screen.getByText(field.name)).toBeTruthy();
    // Every mock score value that used to appear as a badge digit.
    expect(screen.queryByText("91")).toBeNull();
    expect(screen.queryByText("86")).toBeNull();
    expect(screen.queryByText("58")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });
});
