import { describe, expect, it } from "vitest";
import { parseMedicinePackScan, toGtin14 } from "./gs1";

// 05012345678900 has a valid check digit.
const GTIN = "05012345678900";

describe("parseMedicinePackScan", () => {
  it("reads GTIN, expiry, batch and serial from a raw DataMatrix string", () => {
    const raw = `]d201${GTIN}17271231` + `10AB12C\u001d` + `21SER99`;
    expect(parseMedicinePackScan(raw)).toEqual({ gtin: GTIN, expiry: "2027-12-31", batch: "AB12C", serial: "SER99", source: "datamatrix" });
  });

  it("reads the bracketed human-readable form", () => {
    expect(parseMedicinePackScan(`(01)${GTIN}(17)280600(10)LOT-7`)).toEqual({ gtin: GTIN, expiry: "2028-06-30", batch: "LOT-7", serial: null, source: "datamatrix" });
  });

  it("treats day 00 as the last day of the month", () => {
    expect(parseMedicinePackScan(`01${GTIN}17280200`)?.expiry).toBe("2028-02-29");
  });

  it("handles a batch before the expiry when terminated by a group separator", () => {
    expect(parseMedicinePackScan(`01${GTIN}10B1\u001d17270115`)).toMatchObject({ batch: "B1", expiry: "2027-01-15" });
  });

  it("reads a plain EAN-13 as GTIN only", () => {
    expect(parseMedicinePackScan("5012345678900")).toEqual({ gtin: GTIN, batch: null, expiry: null, serial: null, source: "barcode" });
  });

  it("rejects bad check digits, bad dates and unknown structures", () => {
    expect(parseMedicinePackScan("5012345678901")).toBeNull();
    expect(parseMedicinePackScan(`01${GTIN}17271340`)).toBeNull();
    expect(parseMedicinePackScan("field:abc-123")).toBeNull();
    expect(parseMedicinePackScan("")).toBeNull();
  });
});

describe("toGtin14", () => {
  it("pads valid codes and rejects invalid ones", () => {
    expect(toGtin14("5012345678900")).toBe(GTIN);
    expect(toGtin14("12345")).toBeNull();
  });
});
