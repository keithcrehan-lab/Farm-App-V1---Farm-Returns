import { describe, expect, it } from "vitest";
import type { StoredSchemeDefinition } from "./repository";
import { validateStoredSchemeDefinition } from "./validation";

function definition(): StoredSchemeDefinition {
  return {
    version: {
      id: "v1",
      schemeKey: "example",
      displayName: "Example",
      category: "livestock_support",
      authority: "DAFM",
      schemeYear: 2027,
      programmeGeneration: null,
      rulesVersion: "v1",
      effectiveFrom: null,
      effectiveTo: null,
      applicationOpen: null,
      applicationClose: null,
      lateApplicationClose: null,
      publicationState: "verified",
      v1Enabled: true,
      enterpriseRelevance: ["suckler_beef"],
      supportType: null,
      recurrenceType: null,
      requiresAdviser: false,
      verifiedAt: "2027-01-01T00:00:00.000Z",
    },
    sources: [
      {
        id: "source-1",
        schemeVersionId: "v1",
        sourceKey: "terms",
        authorityTier: "dafm_official",
        publisher: "DAFM",
        title: "Terms",
        url: "https://example.invalid",
        publicationDate: "2027-01-01",
        retrievedAt: "2027-01-01T00:00:00.000Z",
        lastVerifiedAt: "2027-01-01T00:00:00.000Z",
        contentFingerprintSha256: "a".repeat(64),
        archivedStoragePath: "schemes/example/2027/terms.pdf",
      },
    ],
    rules: [
      {
        id: "rule-1",
        schemeVersionId: "v1",
        sourceId: "source-1",
        ruleKey: "weight",
        ruleType: "eligibility",
        description: "Weight rule",
        operator: "gte",
        parameters: { threshold: 300 },
        consequence: {},
        hardGate: true,
        effectiveFrom: null,
        effectiveTo: null,
        inputs: [
          {
            ruleId: "rule-1",
            schemeVersionId: "v1",
            dataKey: "cattle.animal.weight",
            label: "Current weight",
            owner: "cattle",
            subjectScope: "animal",
            required: true,
            resolutionOwner: "farmer",
            priority: 10,
            routeKey: "cattle.weight",
          },
        ],
      },
    ],
  };
}

describe("validateStoredSchemeDefinition", () => {
  it("accepts a source-pinned, fingerprinted rule using a registered canonical data key", () => {
    expect(validateStoredSchemeDefinition(definition())).toEqual([]);
  });

  it("rejects a verified source without a content fingerprint", () => {
    const input = definition();
    input.sources[0] = {
      ...input.sources[0],
      contentFingerprintSha256: null,
    };

    expect(
      validateStoredSchemeDefinition(input).map((issue) => issue.code),
    ).toContain("VERIFIED_SOURCE_NOT_FINGERPRINTED");
  });

  it("rejects unregistered data keys instead of creating free-form duplicate questions", () => {
    const input = definition();
    input.rules[0].inputs[0] = {
      ...input.rules[0].inputs[0],
      dataKey: "random.freeform.answer",
    };

    expect(
      validateStoredSchemeDefinition(input).map((issue) => issue.code),
    ).toContain("RULE_INPUT_KEY_UNREGISTERED");
  });

  it("rejects a stored owner that disagrees with the canonical data-key registry", () => {
    const input = definition();
    input.rules[0].inputs[0] = {
      ...input.rules[0].inputs[0],
      owner: "schemes",
    };

    expect(
      validateStoredSchemeDefinition(input).map((issue) => issue.code),
    ).toContain("RULE_INPUT_OWNER_MISMATCH");
  });

  it("requires a fingerprinted source before a hard deadline can be authoritative", () => {
    const input = definition();
    input.sources[0] = {
      ...input.sources[0],
      contentFingerprintSha256: null,
    };
    input.rules[0] = {
      ...input.rules[0],
      ruleType: "deadline",
      hardGate: true,
    };

    expect(
      validateStoredSchemeDefinition(input).map((issue) => issue.code),
    ).toContain("HARD_DEADLINE_SOURCE_NOT_FINGERPRINTED");
  });
});
