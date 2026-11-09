import { describe, expect, it } from "vitest";
import { expiryState, validateMedicinePurchase, type MedicinePurchaseInput } from "./purchase-form";

const base: MedicinePurchaseInput = {
  gtin: "05012345678900",
  hpraLicenceNumber: "VPA10793/004/001",
  batchNumber: "AB12",
  expiryDate: "2027-12-31",
  quantity: 2,
  dateReceived: "2026-11-09",
  supplierName: "Clare Co-op",
  supplierAddress: "Main St, Sixmilebridge",
  vetName: "",
  prescriptionId: "",
  captureSource: "datamatrix",
};

describe("validateMedicinePurchase", () => {
  it("accepts a complete record", () => {
    expect(validateMedicinePurchase(base, "2026-11-09", false)).toBeNull();
  });
  it("requires a product, supplier name and address", () => {
    expect(validateMedicinePurchase({ ...base, hpraLicenceNumber: "" }, "2026-11-09", false)).toMatch(/HPRA/);
    expect(validateMedicinePurchase({ ...base, supplierName: " " }, "2026-11-09", false)).toMatch(/supplier's name/);
    expect(validateMedicinePurchase({ ...base, supplierAddress: "" }, "2026-11-09", false)).toMatch(/address/);
  });
  it("requires a vet for prescription medicines only", () => {
    expect(validateMedicinePurchase(base, "2026-11-09", true)).toMatch(/vet/);
    expect(validateMedicinePurchase({ ...base, vetName: "Dr Ryan" }, "2026-11-09", true)).toBeNull();
  });
  it("rejects bad quantities and dates", () => {
    expect(validateMedicinePurchase({ ...base, quantity: 0 }, "2026-11-09", false)).toMatch(/Quantity/);
    expect(validateMedicinePurchase({ ...base, dateReceived: "2026-11-10" }, "2026-11-09", false)).toMatch(/future/);
    expect(validateMedicinePurchase({ ...base, expiryDate: "2027-02-30" }, "2026-11-09", false)).toMatch(/Expiry/);
  });
});

describe("expiryState", () => {
  it("classifies expiry dates", () => {
    expect(expiryState(null, "2026-11-09")).toBe("unknown");
    expect(expiryState("2026-11-08", "2026-11-09")).toBe("expired");
    expect(expiryState("2026-12-01", "2026-11-09")).toBe("soon");
    expect(expiryState("2027-06-01", "2026-11-09")).toBe("ok");
  });
});
