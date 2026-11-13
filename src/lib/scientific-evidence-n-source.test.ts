import { describe, expect, it } from "vitest";
import { grazingNSourceLabel } from "./scientific-evidence-n-source";

describe("Scientific Evidence Report — N source provenance", () => {
  it("labels calf-to-weaning N from Table 12-2, not Table 12-3", () => {
    expect(grazingNSourceLabel("TEAGASC_GREEN_BOOK_2020_TABLE_12_2_SUCKLER_CALF_TO_WEANING", false)).toBe("N — Table 12-2");
  });
  it("labels calf-to-beef N from Table 12-3", () => {
    expect(grazingNSourceLabel("TEAGASC_GREEN_BOOK_2020_TABLE_12_3_SUCKLER_CALF_TO_BEEF", false)).toBe("N — Table 12-3");
  });
  it("does not misattribute unknown rules to published tables", () => {
    expect(grazingNSourceLabel("UNKNOWN", false)).toBe("N — source not verified");
    expect(grazingNSourceLabel("TEAGASC_CLOVER_BEEF_2026_TABLE_1_DRYSTOCK", true)).toBe("N — clover strategy");
  });
});
