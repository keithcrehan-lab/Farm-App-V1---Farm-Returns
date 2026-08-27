import { describe, expect, it, vi } from "vitest";
import { downloadCsv, downloadJson, downloadText, toCsv } from "./csv";

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

// V3 closure pass (second pass) — RECOMMENDATION_AUDIT_REPORT_SPEC.md §6
// exports (JSON trace / human-readable report).
describe("downloadJson", () => {
  it("serialises the given value as pretty-printed JSON and downloads it", () => {
    let capturedBlob: Blob | undefined;
    const createObjectURL = vi.fn((b: Blob) => {
      capturedBlob = b;
      return "blob:mock-url";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadJson("trace.json", { a: 1, b: "two" });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(capturedBlob?.type).toBe("application/json;charset=utf-8;");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("downloadText", () => {
  it("downloads the given plain text with a text/plain mime type", () => {
    let capturedBlob: Blob | undefined;
    const createObjectURL = vi.fn((b: Blob) => {
      capturedBlob = b;
      return "blob:mock-url";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadText("report.txt", "hello world");

    expect(capturedBlob?.type).toBe("text/plain;charset=utf-8;");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
