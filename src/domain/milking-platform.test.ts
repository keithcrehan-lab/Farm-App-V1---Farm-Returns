import { describe, expect, it } from "vitest";
import { lookupMilkingPlatformOrganicNToMove } from "./milking-platform";

describe("lookupMilkingPlatformOrganicNToMove — S.I. 119/2026 Table 14", () => {
  it("GFT037: allowance 241, SR 259 -> 0", () => {
    expect(lookupMilkingPlatformOrganicNToMove(241, 259)).toEqual({ status: "OK", value: 0, evidenceState: "DERIVED" });
  });

  it("GFT038: allowance 241, SR 260 -> 20", () => {
    expect(lookupMilkingPlatformOrganicNToMove(241, 260)).toEqual({ status: "OK", value: 20, evidenceState: "DERIVED" });
  });

  it("GFT039: allowance 241, SR 279 -> 20", () => {
    expect(lookupMilkingPlatformOrganicNToMove(241, 279)).toEqual({ status: "OK", value: 20, evidenceState: "DERIVED" });
  });

  it("GFT040: allowance 241, SR 280 -> 40", () => {
    expect(lookupMilkingPlatformOrganicNToMove(241, 280)).toEqual({ status: "OK", value: 40, evidenceState: "DERIVED" });
  });

  it("GFT041: allowance 241, SR 299 -> 40", () => {
    expect(lookupMilkingPlatformOrganicNToMove(241, 299)).toEqual({ status: "OK", value: 40, evidenceState: "DERIVED" });
  });

  it("GFT042: allowance 241, SR 300 -> >=41", () => {
    expect(lookupMilkingPlatformOrganicNToMove(241, 300)).toEqual({ status: "OK", value: ">=41", evidenceState: "DERIVED" });
  });

  it("GFT043: allowance 214, SR 286 -> 0", () => {
    expect(lookupMilkingPlatformOrganicNToMove(214, 286)).toEqual({ status: "OK", value: 0, evidenceState: "DERIVED" });
  });

  it("GFT044: allowance 214, SR 287 -> 20", () => {
    expect(lookupMilkingPlatformOrganicNToMove(214, 287)).toEqual({ status: "OK", value: 20, evidenceState: "DERIVED" });
  });

  it("GFT045: allowance 214, SR 307 -> 40", () => {
    expect(lookupMilkingPlatformOrganicNToMove(214, 307)).toEqual({ status: "OK", value: 40, evidenceState: "DERIVED" });
  });

  it("GFT046: allowance 214, SR 327 -> >=41", () => {
    expect(lookupMilkingPlatformOrganicNToMove(214, 327)).toEqual({ status: "OK", value: ">=41", evidenceState: "DERIVED" });
  });

  it("real values for the other 4 allowance bands (114/150/185/200), each band's own lowest boundary", () => {
    expect(lookupMilkingPlatformOrganicNToMove(114, 386)).toEqual({ status: "OK", value: 0, evidenceState: "DERIVED" });
    expect(lookupMilkingPlatformOrganicNToMove(114, 387)).toEqual({ status: "OK", value: 20, evidenceState: "DERIVED" });
    expect(lookupMilkingPlatformOrganicNToMove(150, 350)).toEqual({ status: "OK", value: 0, evidenceState: "DERIVED" });
    expect(lookupMilkingPlatformOrganicNToMove(150, 391)).toEqual({ status: "OK", value: ">=41", evidenceState: "DERIVED" });
    expect(lookupMilkingPlatformOrganicNToMove(185, 315)).toEqual({ status: "OK", value: 0, evidenceState: "DERIVED" });
    expect(lookupMilkingPlatformOrganicNToMove(200, 300)).toEqual({ status: "OK", value: 0, evidenceState: "DERIVED" });
  });
});
