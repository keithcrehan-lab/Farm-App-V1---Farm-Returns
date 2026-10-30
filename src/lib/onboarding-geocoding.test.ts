import { describe, expect, it } from "vitest";
import { normaliseEircode } from "./onboarding-geocoding";

describe("Eircode input normalisation", () => {
  it("accepts the spaced and unspaced forms farmers commonly type", () => {
    expect(normaliseEircode("v95ty07")).toBe("V95 TY07");
    expect(normaliseEircode("V95 TY07")).toBe("V95 TY07");
    expect(normaliseEircode(" d02x285 ")).toBe("D02 X285");
    expect(normaliseEircode("D6Wxxxx")).toBe("D6W XXXX");
  });

  it("does not mistake ordinary place searches for Eircodes", () => {
    expect(normaliseEircode("Galway")).toBeNull();
    expect(normaliseEircode("V95")).toBeNull();
    expect(normaliseEircode("1234567")).toBeNull();
  });
});
