import { describe, expect, it } from "vitest";
import {
  assertManualJobStartValueHasNoOutcomeKeys,
  constructManualJobStartDecision,
  MANUAL_JOB_START_RESERVED_OUTCOME_KEYS,
} from "./index";

/**
 * Direct tests for `constructManualJobStartDecision`'s resolved MEASURED
 * evidence-tier decision (`docs/farm-return-next/BLOCKERS.md`'s "MEASURED
 * evidence-tier judgment call — resolved" entry). The prior session left
 * this as a disclosed, open judgment call; this session's own brief asked
 * for a precise semantics decision: `MEASURED` here classifies only the
 * authorisation event itself (a real, direct, zero-inference fact — the
 * farmer tapped Start, for this activityType, at this timestamp), never
 * the underlying agricultural activity's own outcome (quantity, area,
 * completion), which stays entirely unclassified until a real Confirm
 * Actual exists. These tests prove the current implementation honours
 * that boundary, and guard against a future edit silently widening it.
 */
describe("constructManualJobStartDecision", () => {
  it("uses evidenceState MEASURED, scoped to a narrow authorisation-event marker only — never an agricultural-outcome value", () => {
    const decision = constructManualJobStartDecision({
      farmId: "farm-1",
      activityType: "fertiliser_spreading",
      decidedAt: "2026-09-02T10:00:00Z",
    });

    expect(decision.estimateSnapshot.status).toBe("OK");
    if (decision.estimateSnapshot.status !== "OK") throw new Error("unreachable");
    expect(decision.estimateSnapshot.evidenceState).toBe("MEASURED");
    expect(decision.estimateSnapshot.value).toEqual({ manual: true, activityType: "fertiliser_spreading" });
  });

  it("never carries any of the reserved agricultural-outcome keys on its value — a real regression guard, not just documentation", () => {
    const decision = constructManualJobStartDecision({
      farmId: "farm-1",
      activityType: "slurry_spreading",
      decidedAt: "2026-09-02T10:00:00Z",
    });

    expect(decision.estimateSnapshot.status).toBe("OK");
    if (decision.estimateSnapshot.status !== "OK") throw new Error("unreachable");
    const valueKeys = Object.keys(decision.estimateSnapshot.value as Record<string, unknown>);
    for (const reservedKey of MANUAL_JOB_START_RESERVED_OUTCOME_KEYS) {
      expect(valueKeys).not.toContain(reservedKey);
    }
  });

  it("still authorises the session via a real, accepted Decision (outcome/decidedBy/kind), matching every other real Job Session start's own authorisation invariant", () => {
    const decision = constructManualJobStartDecision({
      farmId: "farm-1",
      activityType: "field_inspection",
      fieldId: "field-7",
      decidedAt: "2026-09-02T10:00:00Z",
    });

    expect(decision.outcome).toBe("accepted");
    expect(decision.decidedBy).toBe("farmer");
    expect(decision.calculationKind).toBe("manual_job_start");
    expect(decision.farmId).toBe("farm-1");
    expect(decision.fieldId).toBe("field-7");
  });

  it("assertManualJobStartValueHasNoOutcomeKeys genuinely throws on any key beyond {manual, activityType} — real coverage of the throwing branch itself, not just a check against a hardcoded literal that always passes (Codex audit LOW, round 1 of this phase's own Dev-validation audit)", () => {
    expect(() => assertManualJobStartValueHasNoOutcomeKeys({ manual: true, activityType: "fertiliser_spreading" })).not.toThrow();
    for (const reservedKey of MANUAL_JOB_START_RESERVED_OUTCOME_KEYS) {
      expect(() =>
        assertManualJobStartValueHasNoOutcomeKeys({ manual: true, activityType: "fertiliser_spreading", [reservedKey]: 1 }),
      ).toThrow(/must never carry any key beyond/);
    }
    // An allowlist, not merely the specific named denylist above — a
    // key that isn't even on the reserved list yet still throws.
    expect(() =>
      assertManualJobStartValueHasNoOutcomeKeys({ manual: true, activityType: "fertiliser_spreading", yield: 42 }),
    ).toThrow(/must never carry any key beyond/);
  });

  it("produces a distinct promptId per real call, keyed on activityType and the real decidedAt timestamp — not a constant, and not colliding across two different manual starts at the same instant for two different activities", () => {
    const a = constructManualJobStartDecision({ farmId: "farm-1", activityType: "silage", decidedAt: "2026-09-02T10:00:00Z" });
    const b = constructManualJobStartDecision({ farmId: "farm-1", activityType: "livestock_work", decidedAt: "2026-09-02T10:00:00Z" });
    expect(a.promptId).not.toBe(b.promptId);
  });
});
