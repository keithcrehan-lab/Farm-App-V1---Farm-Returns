import { describe, expect, it } from "vitest";
import { classifySlurryTiming } from "./slurry-timing";

// Teagasc Farm Carbon Navigator User Manual (Jan 2016), §5.6/§6.4,
// verbatim: "Spring Jan – April, Summer May – June, Late Summer July –
// October." November/December are published by no period at all.
describe("classifySlurryTiming (Teagasc Farm Carbon Navigator periods)", () => {
  it("classifies every month of SPRING (Jan-Apr)", () => {
    expect(classifySlurryTiming("2026-01-01")).toBe("SPRING");
    expect(classifySlurryTiming("2026-02-14")).toBe("SPRING");
    expect(classifySlurryTiming("2026-03-31")).toBe("SPRING");
    expect(classifySlurryTiming("2026-04-30")).toBe("SPRING");
  });

  it("classifies every month of SUMMER (May-Jun)", () => {
    expect(classifySlurryTiming("2026-05-01")).toBe("SUMMER");
    expect(classifySlurryTiming("2026-06-30")).toBe("SUMMER");
  });

  it("classifies every month of LATE_SUMMER (Jul-Oct) — a real timing label, not itself a nutrient rule", () => {
    expect(classifySlurryTiming("2026-07-01")).toBe("LATE_SUMMER");
    expect(classifySlurryTiming("2026-08-15")).toBe("LATE_SUMMER");
    expect(classifySlurryTiming("2026-09-12")).toBe("LATE_SUMMER");
    expect(classifySlurryTiming("2026-10-31")).toBe("LATE_SUMMER");
  });

  it("classifies November/December as UNSUPPORTED — no Carbon Navigator period covers them, never coerced to the nearest one", () => {
    expect(classifySlurryTiming("2026-11-01")).toBe("UNSUPPORTED");
    expect(classifySlurryTiming("2026-12-25")).toBe("UNSUPPORTED");
  });

  it("holds exactly at every published month boundary", () => {
    expect(classifySlurryTiming("2026-04-30")).toBe("SPRING");
    expect(classifySlurryTiming("2026-05-01")).toBe("SUMMER");
    expect(classifySlurryTiming("2026-06-30")).toBe("SUMMER");
    expect(classifySlurryTiming("2026-07-01")).toBe("LATE_SUMMER");
    expect(classifySlurryTiming("2026-10-31")).toBe("LATE_SUMMER");
    expect(classifySlurryTiming("2026-11-01")).toBe("UNSUPPORTED");
  });

  it("is year-independent — only the month component is consulted", () => {
    expect(classifySlurryTiming("2025-03-01")).toBe("SPRING");
    expect(classifySlurryTiming("2027-03-01")).toBe("SPRING");
  });

  it("fails closed to UNSUPPORTED for a malformed date rather than guessing", () => {
    expect(classifySlurryTiming("not-a-date")).toBe("UNSUPPORTED");
    expect(classifySlurryTiming("")).toBe("UNSUPPORTED");
  });
});
