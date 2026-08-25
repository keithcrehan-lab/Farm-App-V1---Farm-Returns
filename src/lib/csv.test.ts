import { describe, expect, it, vi } from "vitest";
import { downloadCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("joins headers and rows with commas and CRLF line endings", () => {
    const csv = toCsv(["Field", "Area (ha)"], [["Home Field", 8.6], ["Back Field", 6.8]]);
    expect(csv).toBe("Field,Area (ha)\r\nHome Field,8.6\r\nBack Field,6.8");
  });

  it("quotes and escapes a field containing a comma, quote, or newline", () => {
    const csv = toCsv(["Note"], [['Contains, a comma'], ['Has a "quote"'], ["Has a\nnewline"]]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe('"Contains, a comma"');
    expect(lines[2]).toBe('"Has a ""quote"""');
    expect(lines[3]).toBe('"Has a\nnewline"');
  });

  it("renders null/undefined as an empty field, not the literal string", () => {
    const csv = toCsv(["A", "B"], [[null, undefined]]);
    expect(csv).toBe("A,B\r\n,");
  });

  it("handles zero rows (headers only)", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B");
  });
});

describe("downloadCsv", () => {
  it("creates an object URL, clicks a real anchor with the given filename, and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCsv("report.csv", "A,B\r\n1,2");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
