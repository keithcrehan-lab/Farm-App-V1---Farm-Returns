import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { parsePhotoReading, readRecordPhoto } from "./read-photo";

describe("record photo reading", () => {
  it("keeps only known, plausible values and never invents the rest", () => {
    expect(parsePhotoReading("feed", 'Here: {"product":"16% beef nut","quantity":"2","unit":"tonnes","batchNumber":"B22","price":"€880","receivedOn":"2nd Nov"}'))
      .toEqual({ product: "16% beef nut", quantity: "2", unit: "tonnes", batchNumber: "B22" });
    expect(parsePhotoReading("spray", '{"productName":"Doxstar Pro","pcsNumber":"PCS 05164"}')).toEqual({ productName: "Doxstar Pro" });
    expect(parsePhotoReading("spray", "no json here")).toEqual({});
  });
  it("does nothing without an API key", async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await readRecordPhoto("feed", "abc", "image/jpeg")).toEqual({ status: "not_configured" });
    if (before) process.env.ANTHROPIC_API_KEY = before;
  });
});
