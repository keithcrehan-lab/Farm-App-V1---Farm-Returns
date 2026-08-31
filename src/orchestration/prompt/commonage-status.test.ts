import { describe, expect, it } from "vitest";
import { tracked, type TrackedValue } from "@/domain/types";
import { promptForCommonageStatus, COMMONAGE_STATUS_PROMPT_KIND, type CommonageStatusField } from "./commonage-status";

const createdAt = "2026-08-29T09:00:00Z";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(
  commonageStatus: TrackedValue<"commonage" | "not_commonage" | "unknown"> | undefined,
  id = "field-1",
  farmId = "farm-1",
  name = "Home Field",
): CommonageStatusField {
  return { id, farmId, name, commonageStatus };
}

describe("promptForCommonageStatus", () => {
  it("OK/commonage, MEASURED (farmer-confirmed): states the field's own classification only, never the downstream fertiliser-legality conclusion", () => {
    const f = field(tracked("commonage", "verified", "Farmer declaration"));

    const prompt = promptForCommonageStatus(f, createdAt);

    expect(prompt.id).toMatch(UUID_RE);
    expect(prompt.farmId).toBe("farm-1");
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.kind).toBe(COMMONAGE_STATUS_PROMPT_KIND);
    expect(prompt.createdAt).toBe(createdAt);
    expect(prompt.regulatory).toBe("compliance_value");
    expect(prompt.calculationVersion).toBeUndefined();
    expect(prompt.basis).toEqual({ status: "OK", value: "commonage", evidenceState: "MEASURED" });
    expect(prompt.title).toBe("Home Field is commonage land");
    expect(prompt.description).toBe("Home Field is confirmed as commonage land.");
    // Codex audit HIGH (audit-logs/20260831T211859Z.md): an earlier
    // version asserted checkCommonageFertiliserGate's own legal
    // conclusion in prose without ever calling that gate -- a real
    // DOMAIN_CONTRACTS.md duplication. This Prompt's basis never runs
    // that gate, so its copy must never claim its result.
    expect(prompt.description).not.toContain("Chemical fertiliser is not permitted");
    expect(prompt.description).not.toContain("nutrient plan");
    expect(prompt.inputsSnapshot).toEqual({
      commonageStatus: tracked("commonage", "verified", "Farmer declaration"),
      rule: expect.stringContaining("commonage_rules_2026.csv"),
    });
  });

  it("OK/not_commonage, MEASURED: states the confirmed classification only", () => {
    const f = field(tracked("not_commonage", "verified", "Farmer declaration"));

    const prompt = promptForCommonageStatus(f, createdAt);

    expect(prompt.basis).toEqual({ status: "OK", value: "not_commonage", evidenceState: "MEASURED" });
    expect(prompt.title).toBe("Home Field is confirmed not commonage");
    expect(prompt.description).toBe("Home Field is confirmed as not commonage land.");
  });

  it("OK/commonage, IRISH_DEFAULT (not yet farmer-confirmed): actively invites confirmation, does not present it as settled fact", () => {
    // Codex audit HIGH (audit-logs/20260831T211859Z.md): requireCommonageStatus
    // can resolve OK from an unconfirmed "estimated"/"mapped" TrackedValue
    // just as much as a real farmer declaration (evidenceStateForDirectAssertion,
    // input-gates.ts) -- an earlier version of this Prompt's copy didn't
    // distinguish MEASURED from IRISH_DEFAULT at all.
    const f = field(tracked("commonage", "estimated", "Farm Return assumption"));

    const prompt = promptForCommonageStatus(f, createdAt);

    expect(prompt.basis).toEqual({ status: "OK", value: "commonage", evidenceState: "IRISH_DEFAULT" });
    expect(prompt.title).toBe("Home Field may be commonage land — please confirm");
    expect(prompt.description).toContain("hasn't been confirmed");
    expect(prompt.description).toContain("Please confirm or correct");
    expect(prompt.description).not.toBe("Home Field is confirmed as commonage land.");
  });

  it("OK/not_commonage, IRISH_DEFAULT: same unconfirmed-default framing, not presented as settled fact", () => {
    // A real, non-hypothetical case: fields.ts's own default for a new
    // field is tracked("unknown", "estimated", ...) (a different,
    // BLOCKED case below) -- but a farmer or an external mapped source
    // could in principle assert "not_commonage" at "estimated"/"mapped"
    // status without a verified/farmer_adjusted declaration.
    const f = field(tracked("not_commonage", "estimated", "Farm Return assumption"));

    const prompt = promptForCommonageStatus(f, createdAt);

    expect(prompt.basis).toEqual({ status: "OK", value: "not_commonage", evidenceState: "IRISH_DEFAULT" });
    expect(prompt.title).toBe("Home Field is recorded as not commonage — please confirm");
    expect(prompt.description).toContain("hasn't been confirmed");
    expect(prompt.description).not.toBe("Home Field is confirmed as not commonage land.");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: commonageStatus never captured (undefined) fails closed, not assumed not_commonage", () => {
    const f = field(undefined);

    const prompt = promptForCommonageStatus(f, createdAt);

    expect(prompt.basis).toMatchObject({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "UNKNOWN_COMMONAGE_STATUS",
      missingInputs: ["FIELD_COMMONAGE_STATUS"],
    });
    expect(prompt.title).toBe("Commonage status needs confirming — Home Field");
    expect(prompt.description).toContain("UNKNOWN_COMMONAGE_STATUS");
    expect(prompt.description).toContain("FIELD_COMMONAGE_STATUS");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: the real default new-field value (tracked \"unknown\") fails closed the same way as never-captured", () => {
    // fields.ts's own real default for a newly created field --
    // field(tracked("unknown", "estimated", "Farm Return assumption"))
    // must resolve identically to field(undefined), not be silently
    // treated as a real farmer answer.
    const f = field(tracked("unknown", "estimated", "Farm Return assumption"));

    const prompt = promptForCommonageStatus(f, createdAt);

    expect(prompt.basis).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "UNKNOWN_COMMONAGE_STATUS" });
  });

  it("does not mix evidence across fields — two Field objects never produce a mismatched fieldId/basis pairing", () => {
    const fieldA = field(tracked("commonage", "verified", "Farmer declaration"), "field-a", "farm-1", "Field A");
    const fieldB = field(tracked("not_commonage", "verified", "Farmer declaration"), "field-b", "farm-1", "Field B");

    const promptA = promptForCommonageStatus(fieldA, createdAt);
    const promptB = promptForCommonageStatus(fieldB, createdAt);

    expect(promptA.fieldId).toBe("field-a");
    expect(promptA.basis).toMatchObject({ value: "commonage" });
    expect(promptB.fieldId).toBe("field-b");
    expect(promptB.basis).toMatchObject({ value: "not_commonage" });
  });

  it("inputsSnapshot is a real deep snapshot, not a shared reference to the caller's Field object", () => {
    const trackedValue = tracked<"commonage" | "not_commonage" | "unknown">("commonage", "verified", "Farmer declaration");
    const f = field(trackedValue);

    const prompt = promptForCommonageStatus(f, createdAt);
    (trackedValue as { value: string }).value = "not_commonage";

    // Mutating the caller's own object after the Prompt was built must
    // not retroactively change the Prompt's own trace -- the same
    // discipline buildPrompt's own doc comment documents for basis/
    // inputsSnapshot generally.
    expect(prompt.inputsSnapshot?.commonageStatus).toMatchObject({ value: "commonage" });
  });
});
