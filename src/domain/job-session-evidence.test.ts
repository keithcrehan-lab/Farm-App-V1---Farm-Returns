import { describe, expect, it } from "vitest";
import { actualValue, estimatedValue, observedValue, reviseActualValue, type JobEvidenceValue } from "./job-session-evidence";

describe("observed/estimated/actual cannot silently convert", () => {
  it("observedValue and estimatedValue are tagged distinctly, and actualValue requires an explicit new construction", () => {
    const observed = observedValue(53.47123, "Phone GPS");
    const estimated = estimatedValue("fertiliser_spreading", "Farm Return plan");
    expect(observed.tier).toBe("observed");
    expect(estimated.tier).toBe("estimated");

    // There is no function that takes an "observed" or "estimated"
    // JobEvidenceValue and returns an "actual" one -- promoting a tier
    // requires reading `.value` off the source and passing it to
    // actualValue() explicitly, a visible step at every real call site.
    const actual = actualValue(observed.value, "Farmer confirmed");
    expect(actual.tier).toBe("actual");
    expect(actual.value).toBe(observed.value);
    // The two are genuinely distinct objects -- confirming does not
    // mutate the original observed evidence in place.
    expect(actual).not.toBe(observed as unknown as JobEvidenceValue<number>);
  });
});

describe("reviseActualValue", () => {
  it("chains the previous actual value rather than discarding it", () => {
    const first = actualValue(4.1, "Farmer confirmed", { recordedAt: "2026-09-02T10:00:00Z" });
    const revised = reviseActualValue(first, 4.3, "Farmer confirmed (edit)");

    expect(revised.value).toBe(4.3);
    expect(revised.tier).toBe("actual");
    expect(revised.previous).toBe(first);
    expect(revised.previous?.value).toBe(4.1);

    // A second revision keeps the whole chain, not just the immediate parent.
    const revisedAgain = reviseActualValue(revised, 4.0, "Farmer confirmed (edit 2)");
    expect(revisedAgain.previous).toBe(revised);
    expect(revisedAgain.previous?.previous).toBe(first);
  });

  it("refuses to revise a non-actual value", () => {
    const estimate = estimatedValue(4.1, "Farm Return plan");
    expect(() => reviseActualValue(estimate, 4.3, "Farmer confirmed")).toThrow(/only "actual" values/);
  });
});
