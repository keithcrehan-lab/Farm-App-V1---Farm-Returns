import { describe, expect, it } from "vitest";
import type { StoredSchemeVersion } from "./repository";
import {
  deriveSchemeEntryWindowState,
  deriveSchemeProgrammeState,
} from "./window-state";

function version(
  overrides: Partial<StoredSchemeVersion> = {},
): StoredSchemeVersion {
  return {
    id: "v1",
    schemeKey: "example",
    displayName: "Example",
    category: "livestock_support",
    authority: "DAFM",
    schemeYear: 2027,
    programmeGeneration: null,
    rulesVersion: "v1",
    effectiveFrom: "2027-01-01T00:00:00.000Z",
    effectiveTo: "2027-12-31T23:59:59.999Z",
    applicationOpen: "2027-02-01T00:00:00.000Z",
    applicationClose: "2027-05-15T23:59:59.000Z",
    lateApplicationClose: "2027-06-09T23:59:59.000Z",
    publicationState: "verified",
    v1Enabled: true,
    enterpriseRelevance: ["suckler_beef"],
    supportType: "annual",
    recurrenceType: "annual",
    requiresAdviser: false,
    verifiedAt: "2027-01-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("scheme runtime states", () => {
  it("derives upcoming/open/late/closed from dates rather than storing a stale label", () => {
    const v = version();

    expect(
      deriveSchemeEntryWindowState(v, "2027-01-20T00:00:00.000Z"),
    ).toBe("UPCOMING");
    expect(
      deriveSchemeEntryWindowState(v, "2027-03-01T00:00:00.000Z"),
    ).toBe("OPEN");
    expect(
      deriveSchemeEntryWindowState(v, "2027-05-20T00:00:00.000Z"),
    ).toBe("LATE_WINDOW");
    expect(
      deriveSchemeEntryWindowState(v, "2027-07-01T00:00:00.000Z"),
    ).toBe("CLOSED");
  });

  it("keeps programme state separate from a closed new-entry window", () => {
    const v = version({
      effectiveFrom: "2023-01-01T00:00:00.000Z",
      effectiveTo: "2027-12-31T23:59:59.999Z",
      applicationOpen: "2023-01-01T00:00:00.000Z",
      applicationClose: "2023-05-15T23:59:59.000Z",
      lateApplicationClose: null,
    });

    expect(
      deriveSchemeProgrammeState(v, "2026-11-05T00:00:00.000Z"),
    ).toBe("IN_FORCE");
    expect(
      deriveSchemeEntryWindowState(v, "2026-11-05T00:00:00.000Z"),
    ).toBe("CLOSED");
  });

  it("does not claim a scheme is open forever when no entry window is recorded", () => {
    const v = version({
      applicationOpen: null,
      applicationClose: null,
      lateApplicationClose: null,
    });

    expect(
      deriveSchemeEntryWindowState(v, "2027-04-01T00:00:00.000Z"),
    ).toBe("NO_ENTRY_WINDOW_RECORDED");
  });

  it("treats superseded and draft versions independently of calendar dates", () => {
    expect(
      deriveSchemeProgrammeState(
        version({ publicationState: "draft", verifiedAt: null }),
        "2027-04-01T00:00:00.000Z",
      ),
    ).toBe("DRAFT");

    expect(
      deriveSchemeProgrammeState(
        version({ publicationState: "superseded" }),
        "2027-04-01T00:00:00.000Z",
      ),
    ).toBe("SUPERSEDED");
  });
});
