import { describe, expect, it } from "vitest";
import { LOCAL_BUFFER_OVERRIDE_GATE_VERSION } from "@/domain/local-buffer-override-gate";
import { tracked, type TrackedValue } from "@/domain/types";
import {
  promptForLocalBufferOverride,
  LOCAL_BUFFER_OVERRIDE_PROMPT_KIND,
  type LocalBufferOverrideField,
} from "./local-buffer-override";

const createdAt = "2026-09-01T09:00:00Z";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WaterBufferValue = {
  nearestFeature?: string;
  distanceM?: number;
  localOverrideStatus: "authoritative_rule" | "verified_none" | "unknown";
  featureType?:
    | "surface_water"
    | "major_drinking_water_abstraction"
    | "drinking_water_abstraction"
    | "other_drinking_well_spring_borehole"
    | "lake_or_turlough_likely_to_flood"
    | "exposed_cavernous_or_karst_limestone_feature";
  localOverrideDistanceM?: number;
};

function field(
  waterBufferContext: TrackedValue<WaterBufferValue> | undefined,
  id = "field-1",
  farmId = "farm-1",
  name = "Home Field",
): LocalBufferOverrideField {
  return { id, farmId, name, waterBufferContext };
}

function wbc(value: WaterBufferValue, status: "verified" | "farmer_adjusted" | "estimated" | "mapped" = "verified"): TrackedValue<WaterBufferValue> {
  return tracked(value, status, "Farmer assessment");
}

describe("promptForLocalBufferOverride", () => {
  it("OK/verified_none, farmer-confirmed: a field confirmed to have no local override produces a real Prompt naming the national baseline", () => {
    const f = field(wbc({ localOverrideStatus: "verified_none" }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.id).toMatch(UUID_RE);
    expect(prompt.farmId).toBe("farm-1");
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.kind).toBe(LOCAL_BUFFER_OVERRIDE_PROMPT_KIND);
    expect(prompt.createdAt).toBe(createdAt);
    expect(prompt.regulatory).toBe("compliance_value");
    // Codex audit HIGH (audit-logs/20260901T102220Z.md): calculationVersion
    // must cite the real module that computes basis, not be omitted.
    expect(prompt.calculationVersion).toBe(LOCAL_BUFFER_OVERRIDE_GATE_VERSION);
    expect(prompt.basis).toEqual({ status: "OK", value: "NATIONAL_BASELINE_APPLIES", evidenceState: "DERIVED" });
    expect(prompt.title).toBe("Home Field has no local water-buffer override");
    expect(prompt.description).toContain("has been confirmed");
    expect(prompt.description).not.toContain("recorded distance meets it");
    expect(prompt.description).not.toContain("hasn't been confirmed");
  });

  it("OK/authoritative_rule, distance sufficient, farmer-confirmed: a satisfied local override produces distinct copy from verified_none", () => {
    const f = field(wbc({ localOverrideStatus: "authoritative_rule", distanceM: 50, localOverrideDistanceM: 30 }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.basis).toEqual({ status: "OK", value: "NATIONAL_BASELINE_APPLIES", evidenceState: "DERIVED" });
    expect(prompt.title).toBe("Home Field's local water-buffer override is satisfied");
    expect(prompt.description).toContain("recorded distance meets it");
  });

  it("OK/authoritative_rule, distance sufficient: states the local determination overrides the national baseline, not that both apply -- Codex audit HIGH, real sourced regulatory text", () => {
    // docs/scientific-engine/v3/rules_statutory/local_buffer_override_rules_2026.csv's
    // own `precedence` column: "local specified distance overrides
    // national baseline" / "local determination overrides generic
    // baseline for that source". An earlier version of this copy claimed
    // the opposite (national applies "on top of this, unaffected").
    const f = field(wbc({ localOverrideStatus: "authoritative_rule", distanceM: 50, localOverrideDistanceM: 30 }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.description).toContain("overrides the generic national buffer distance");
    expect(prompt.description).not.toContain("apply on top of this");
    expect(prompt.description).not.toContain("unaffected");
  });

  it("OK/verified_none, NOT farmer-confirmed: actively invites confirmation, does not present it as settled fact", () => {
    // Codex audit HIGH (audit-logs/20260901T102220Z.md): checkLocalBufferOverride's
    // own OK arm always classifies evidenceState as DERIVED regardless of
    // confirmation status, so the confirmed/unconfirmed distinction must
    // come from the raw waterBufferContext.status this Prompt reads
    // directly, not from basis.evidenceState.
    const f = field(wbc({ localOverrideStatus: "verified_none" }, "estimated"));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.basis).toEqual({ status: "OK", value: "NATIONAL_BASELINE_APPLIES", evidenceState: "DERIVED" });
    expect(prompt.title).toBe("Home Field may have no local water-buffer override — please confirm");
    expect(prompt.description).toContain("hasn't been confirmed");
    expect(prompt.description).not.toBe("Home Field has been confirmed to have no local-authority water-buffer override — the national buffer distances apply here. (This checks the local override layer only; the separate national buffer distance itself is a different check.)");
  });

  it("OK/authoritative_rule, distance sufficient, NOT farmer-confirmed: same unconfirmed framing", () => {
    const f = field(wbc({ localOverrideStatus: "authoritative_rule", distanceM: 50, localOverrideDistanceM: 30 }, "mapped"));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.title).toBe("Home Field may have a local water-buffer override — please confirm");
    expect(prompt.description).toContain("hasn't been confirmed");
  });

  it("farmer_adjusted counts as confirmed, the same as verified", () => {
    const f = field(wbc({ localOverrideStatus: "verified_none" }, "farmer_adjusted"));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.title).toBe("Home Field has no local water-buffer override");
  });

  it("LEGAL_PROHIBITION: a local override that exceeds the actual recorded distance fails closed with a real, sourced consequence", () => {
    const f = field(wbc({ localOverrideStatus: "authoritative_rule", distanceM: 10, localOverrideDistanceM: 30 }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.basis).toMatchObject({
      status: "LEGAL_PROHIBITION",
      reasonCode: "LOCAL_BUFFER_OVERRIDE_EXCEEDS_ACTUAL_DISTANCE",
    });
    expect(prompt.description).toContain("30m");
    expect(prompt.description).toContain("10m");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE, not a fabricated 0m LEGAL_PROHIBITION: authoritative_rule with a known override distance but no recorded actual distance", () => {
    // Codex audit CRITICAL (audit-logs/20260901T102220Z.md): an earlier
    // version defaulted the missing actualDistanceM to 0, producing a
    // real LEGAL_PROHIBITION whose own message asserted "...exceeds the
    // actual distance of 0m" -- a fabricated number reaching a real
    // Prompt. Fixed: this case must fail closed as insufficient
    // evidence, never synthesize a distance.
    const f = field(wbc({ localOverrideStatus: "authoritative_rule", localOverrideDistanceM: 5 }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.basis).toMatchObject({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_LOCAL_BUFFER_ACTUAL_DISTANCE",
      missingInputs: ["actualDistanceM"],
    });
    // inputsSnapshot must reflect the real, missing value -- never the
    // synthesized 0 the fix removed.
    expect(prompt.inputsSnapshot?.actualDistanceM).toBeUndefined();
  });

  it("a missing actual distance under verified_none/unknown status does not fail closed -- checkLocalBufferOverride never reads it in those branches, so there is real evidence for those arms regardless", () => {
    const verifiedNone = promptForLocalBufferOverride(field(wbc({ localOverrideStatus: "verified_none" })), createdAt);
    const unknownStatus = promptForLocalBufferOverride(field(wbc({ localOverrideStatus: "unknown" })), createdAt);

    expect(verifiedNone.basis).toMatchObject({ status: "OK" });
    expect(unknownStatus.basis).toMatchObject({ status: "UNKNOWN" });
  });

  it("UNKNOWN: an explicitly recorded 'unknown' local-override status is not treated as no-override or as blocked", () => {
    const f = field(wbc({ localOverrideStatus: "unknown" }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.basis).toMatchObject({ status: "UNKNOWN", reasonCode: "LOCAL_BUFFER_STATUS_UNKNOWN" });
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: authoritative_rule with no recorded override distance fails closed, not assumed satisfied", () => {
    const f = field(wbc({ localOverrideStatus: "authoritative_rule", distanceM: 50 }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.basis).toMatchObject({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "LOCAL_BUFFER_STATUS_UNKNOWN",
      missingInputs: ["localOverrideDistanceM"],
    });
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: waterBufferContext never captured (undefined) fails closed, the real default new-field value", () => {
    // fields.ts's own real default for a newly created field.
    const f = field(undefined);

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.basis).toMatchObject({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_LOCAL_BUFFER_ASSESSMENT",
      missingInputs: ["LOCAL_WATER_BUFFER_OVERRIDE"],
    });
    expect(prompt.title).toBe("Local water-buffer override needs confirming — Home Field");
  });

  it("OK arm's evidenceState is always DERIVED, regardless of whether the underlying waterBufferContext was farmer-verified or merely estimated", () => {
    const verified = promptForLocalBufferOverride(field(wbc({ localOverrideStatus: "verified_none" }, "verified")), createdAt);
    const estimated = promptForLocalBufferOverride(field(wbc({ localOverrideStatus: "verified_none" }, "estimated")), createdAt);

    expect(verified.basis).toMatchObject({ evidenceState: "DERIVED" });
    expect(estimated.basis).toMatchObject({ evidenceState: "DERIVED" });
  });

  it("does not mix evidence across fields — two Field objects never produce a mismatched fieldId/basis pairing", () => {
    const fieldA = field(wbc({ localOverrideStatus: "verified_none" }), "field-a", "farm-1", "Field A");
    const fieldB = field(wbc({ localOverrideStatus: "unknown" }), "field-b", "farm-1", "Field B");

    const promptA = promptForLocalBufferOverride(fieldA, createdAt);
    const promptB = promptForLocalBufferOverride(fieldB, createdAt);

    expect(promptA.fieldId).toBe("field-a");
    expect(promptA.basis).toMatchObject({ status: "OK" });
    expect(promptB.fieldId).toBe("field-b");
    expect(promptB.basis).toMatchObject({ status: "UNKNOWN" });
  });

  it("inputsSnapshot carries the real raw waterBufferContext and the real (non-synthesized) actual distance", () => {
    const f = field(wbc({ localOverrideStatus: "authoritative_rule", distanceM: 40, localOverrideDistanceM: 30 }));

    const prompt = promptForLocalBufferOverride(f, createdAt);

    expect(prompt.inputsSnapshot?.waterBufferContext).toEqual(
      wbc({ localOverrideStatus: "authoritative_rule", distanceM: 40, localOverrideDistanceM: 30 }),
    );
    expect(prompt.inputsSnapshot?.actualDistanceM).toBe(40);
  });
});
