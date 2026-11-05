import { describe, expect, it } from "vitest";
import { schemeRequirementReturnPath, withSchemeReturnTo } from "./routing";

describe("scheme data routing", () => {
  it("preserves the exact scheme/version/requirement return location", () => {
    expect(
      schemeRequirementReturnPath({
        schemeId: "scep",
        schemeVersion: "2027-v1",
        requirementId: "animal-weight-372",
      }),
    ).toBe(
      "/schemes?scheme=scep&version=2027-v1&requirement=animal-weight-372#requirement-animal-weight-372",
    );
  });

  it("adds returnTo without losing an exact owner query or hash", () => {
    const returnTo = schemeRequirementReturnPath({
      schemeId: "scep",
      schemeVersion: "2027-v1",
      requirementId: "field-use-p-collins",
    });

    const route = withSchemeReturnTo(
      "/fields?field=field-1&chapter=overview&focus=field-use#field-use",
      returnTo,
    );

    expect(route.returnTo).toBe(returnTo);
    expect(route.href).toContain("/fields?");
    expect(route.href).toContain("field=field-1");
    expect(route.href).toContain("focus=field-use");
    expect(route.href).toContain("returnTo=");
    expect(route.href).toMatch(/#field-use$/);
  });

  it("rejects external owner and return paths", () => {
    expect(() =>
      withSchemeReturnTo(
        "https://example.com/fields",
        "/schemes?scheme=scep",
      ),
    ).toThrow(/internal Farm Return path/i);

    expect(() =>
      withSchemeReturnTo(
        "/fields",
        "https://example.com/schemes",
      ),
    ).toThrow(/internal Farm Return path/i);
  });
});
