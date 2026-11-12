import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PaddockQuestion } from "./PaddockQuestion";

const FIELDS = [
  { id: "f1", name: "Callas", areaHa: 4.2 },
  { id: "f2", name: "House Field", areaHa: 1.85 },
];

describe("paddock question after scanning fields", () => {
  afterEach(cleanup);

  it("lists each field just added with a Divide button", () => {
    const onDivide = vi.fn();
    render(<PaddockQuestion fields={FIELDS} paddockCounts={{}} onDivide={onDivide} />);
    expect(screen.getByText("Are any of these fenced into paddocks?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Divide House Field into paddocks" }));
    expect(onDivide).toHaveBeenCalledWith("f2");
  });

  it("shows how many paddocks a divided field has, and no second Divide button for it", () => {
    render(<PaddockQuestion fields={FIELDS} paddockCounts={{ f1: 3 }} onDivide={vi.fn()} />);
    expect(screen.getByText("3 paddocks")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Divide Callas into paddocks" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Divide House Field into paddocks" })).toBeInTheDocument();
  });

  it("asks about the one field when only one was added", () => {
    render(<PaddockQuestion fields={[FIELDS[0]]} paddockCounts={{}} onDivide={vi.fn()} />);
    expect(screen.getByText("Is this field fenced into paddocks?")).toBeInTheDocument();
    expect(screen.getByText("1 field saved")).toBeInTheDocument();
  });
});
