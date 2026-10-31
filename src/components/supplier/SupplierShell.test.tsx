import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SupplierShell } from "./SupplierShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/supplier" }));

describe("SupplierShell", () => {
  it("provides a clear return path to the main Farm Return app", () => {
    render(<SupplierShell supplierName="Farm Return Dev Supplier" role="admin"><div>Portal body</div></SupplierShell>);
    expect(screen.getByRole("link", { name: /back to farm return/i }).getAttribute("href")).toBe("/today");
    expect(screen.getByText("Farm Return Dev Supplier")).toBeTruthy();
  });
});
