import { describe, expect, it } from "vitest";
import { checkLocalBufferOverrideWithEvidence } from "./local-buffer-override-gate";
import { blockedInsufficientEvidence, ok, unknown, type EngineOutcome } from "./evidence";

function localOverrideStatus(
  value: "authoritative_rule" | "verified_none" | "unknown",
): EngineOutcome<"authoritative_rule" | "verified_none" | "unknown"> {
  return ok(value, "MEASURED");
}

describe("checkLocalBufferOverrideWithEvidence", () => {
  it("BLOCKED_INSUFFICIENT_EVIDENCE: authoritative_rule with a known override distance but no measured actual distance -- never a fabricated 0m", () => {
    const outcome = checkLocalBufferOverrideWithEvidence({
      actualDistanceM: undefined,
      localOverrideStatus: localOverrideStatus("authoritative_rule"),
      localOverrideDistanceM: 30,
    });

    expect(outcome).toEqual(
      blockedInsufficientEvidence("MISSING_LOCAL_BUFFER_ACTUAL_DISTANCE", ["actualDistanceM"]),
    );
  });

  it("LEGAL_PROHIBITION: authoritative_rule with a real actual distance below the override requirement -- the real distance reaches the message, never a placeholder", () => {
    const outcome = checkLocalBufferOverrideWithEvidence({
      actualDistanceM: 10,
      localOverrideStatus: localOverrideStatus("authoritative_rule"),
      localOverrideDistanceM: 30,
    });

    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.consequence).toBe("A local authority buffer of 30m applies and exceeds the actual distance of 10m.");
    }
  });

  it("OK: authoritative_rule with a real actual distance meeting the override requirement", () => {
    const outcome = checkLocalBufferOverrideWithEvidence({
      actualDistanceM: 50,
      localOverrideStatus: localOverrideStatus("authoritative_rule"),
      localOverrideDistanceM: 30,
    });

    expect(outcome).toEqual(ok("NATIONAL_BASELINE_APPLIES", "DERIVED"));
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: authoritative_rule with no recorded override distance at all -- propagated from the frozen gate unchanged, missing actual distance is irrelevant here", () => {
    const outcome = checkLocalBufferOverrideWithEvidence({
      actualDistanceM: undefined,
      localOverrideStatus: localOverrideStatus("authoritative_rule"),
      localOverrideDistanceM: undefined,
    });

    // This module's own guard only fires when localOverrideDistanceM IS
    // known but actualDistanceM isn't -- when neither is known, the
    // frozen gate's own guard (a different, pre-existing reason code)
    // applies instead, proving the two guards don't overlap or race.
    expect(outcome).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "LOCAL_BUFFER_STATUS_UNKNOWN" });
  });

  it("OK/NATIONAL_BASELINE_APPLIES: verified_none never needs an actual distance -- a missing one is genuinely inert, not blocked", () => {
    const outcome = checkLocalBufferOverrideWithEvidence({
      actualDistanceM: undefined,
      localOverrideStatus: localOverrideStatus("verified_none"),
      localOverrideDistanceM: undefined,
    });

    expect(outcome).toEqual(ok("NATIONAL_BASELINE_APPLIES", "DERIVED"));
  });

  it("UNKNOWN: an 'unknown' local-override status never needs an actual distance either -- a missing one is genuinely inert", () => {
    const outcome = checkLocalBufferOverrideWithEvidence({
      actualDistanceM: undefined,
      localOverrideStatus: localOverrideStatus("unknown"),
      localOverrideDistanceM: undefined,
    });

    expect(outcome).toEqual(unknown("LOCAL_BUFFER_STATUS_UNKNOWN"));
  });

  it("propagates a non-OK localOverrideStatus unchanged (e.g. the input gate's own BLOCKED_INSUFFICIENT_EVIDENCE), never overridden by this module's own guard", () => {
    const blockedStatus: EngineOutcome<"authoritative_rule" | "verified_none" | "unknown"> = blockedInsufficientEvidence(
      "MISSING_LOCAL_BUFFER_ASSESSMENT",
      ["LOCAL_WATER_BUFFER_OVERRIDE"],
    );

    const outcome = checkLocalBufferOverrideWithEvidence({
      actualDistanceM: undefined,
      localOverrideStatus: blockedStatus,
      localOverrideDistanceM: undefined,
    });

    expect(outcome).toEqual(blockedStatus);
  });
});
