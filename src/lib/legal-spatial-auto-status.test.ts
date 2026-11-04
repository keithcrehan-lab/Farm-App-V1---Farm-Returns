import { describe, expect, it } from "vitest";
import { legalSpatialAutoStatusMessage } from "./legal-spatial-auto-status";

const base = {
  assessed: 2,
  updated: 0,
  unresolvedCommonage: 0,
  unresolvedWater: 0,
  unavailableCommonage: 0,
  unavailableWater: 0,
};

describe("legalSpatialAutoStatusMessage", () => {
  it("never claims the watercourse check completed when the EPA service also failed", () => {
    const message = legalSpatialAutoStatusMessage({
      ...base,
      unresolvedCommonage: 2,
      unavailableCommonage: 2,
      unresolvedWater: 2,
      unavailableWater: 2,
    });
    expect(message).not.toMatch(/watercourse checks completed/i);
    expect(message).toMatch(/EPA watercourse service is currently unavailable for 2 fields/);
    expect(message).toMatch(/DAFM commonage service is currently unavailable for 2 fields/);
  });

  it("reports partial failures alongside fields that were filled", () => {
    const message = legalSpatialAutoStatusMessage({
      ...base,
      updated: 1,
      unresolvedWater: 1,
      unavailableWater: 1,
    });
    expect(message).toMatch(/filled 1 mapped field evidence record automatically/);
    expect(message).toMatch(/EPA watercourse service is currently unavailable for 1 field;/);
  });

  it("distinguishes nothing found from a service failure, never as evidence of absence", () => {
    const message = legalSpatialAutoStatusMessage({
      ...base,
      unresolvedWater: 1,
      unresolvedCommonage: 1,
    });
    expect(message).toMatch(/No EPA-mapped watercourse was found within 1 km of 1 field; Farm Return does not treat that as no watercourse/);
    expect(message).toMatch(/No DAFM LPIS parcel matched 1 field, so commonage status is still unknown/);
    expect(message).not.toMatch(/unavailable/);
  });

  it("uses the generic completion message only when nothing specific remains", () => {
    expect(legalSpatialAutoStatusMessage(base)).toBe(
      "Automatic public-data checks completed. Any remaining items genuinely need confirmation.",
    );
  });
});
