import { describe, expect, it } from "vitest";
import { formatNonNegative } from "./format";

describe("formatNonNegative", () => {
  it("formats a normal positive value exactly like formatNumber", () => {
    expect(formatNonNegative(48, 2)).toBe("48");
    expect(formatNonNegative(1482.4, 2)).toBe("1,482.4");
  });

  it("never shows a false zero for a genuinely positive value that rounds to 0 at this precision", () => {
    expect(formatNonNegative(0.004, 2)).toBe("< 0.01");
    expect(formatNonNegative(0.04, 1)).toBe("< 0.1");
    expect(formatNonNegative(0.4, 0)).toBe("< 1");
  });

  it("shows a real, confirmed zero as a plain zero, never as '< threshold'", () => {
    expect(formatNonNegative(0, 2)).toBe("0");
  });

  it("shows a value right at the display boundary as its real rounded figure, not a false '<'", () => {
    // 0.01 rounds to "0.01" at 2dp -- a real, displayable value, not below threshold.
    expect(formatNonNegative(0.01, 2)).toBe("0.01");
  });
});
