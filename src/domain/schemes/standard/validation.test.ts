import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { StoredSchemeDefinition } from "../repository";
import type {
  RequirementRegisterRow,
  SchemeContentPack,
  SchemeSeedPacket,
  SchemeSourcePack,
  SchemeSourceRecord,
  SchemeVersionPin,
} from "./contracts";
import {
  assertSchemeContentPack,
  assertSchemeSeedPacket,
  computeSchemeContentPackFingerprint,
  computeSchemeSeedPacketFingerprint,
  parseSeedPacketDocument,
  validateRegisterCoverage,
  validateRequirementRegister,
  validateSchemeContentPack,
  validateSchemeSeedPacket,
  validateSchemeSourcePack,
} from "./validation";

const sha256 = (input: string) =>
  createHash("sha256").update(input, "utf8").digest("hex");

const PIN: SchemeVersionPin = {
  schemeKey: "synth-scheme",
  schemeYear: 2031,
  rulesVersion: "synth-2031-v1",
};
const OTHER_YEAR_PIN: SchemeVersionPin = {
  schemeKey: "synth-scheme",
  schemeYear: 2032,
  rulesVersion: "synth-2032-v1",
};
const REGISTERED_KEY = "cattle.animal.weight";

// Stored row ids are uuid columns.
const VERSION_ROW_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_ROW_ID = "00000000-0000-4000-8000-000000000002";
const SOURCE_ROW_ID_2 = "00000000-0000-4000-8000-000000000003";
const RULE_ROW_ID = "00000000-0000-4000-8000-000000000004";
const RULE_ROW_ID_2 = "00000000-0000-4000-8000-000000000005";
const OTHER_VERSION_ROW_ID = "00000000-0000-4000-8000-000000000006";

const REVIEW = {
  reviewer: "SYNTH-REVIEWER",
  reviewedOn: "2031-02-01",
  scope: "WHOLE_DOCUMENT_AGAINST_REGISTER" as const,
  recordLocation: "docs/product/schemes/synth/REVIEW.md",
};

function source(overrides: Partial<SchemeSourceRecord> = {}): SchemeSourceRecord {
  return {
    sourceId: "SYNTH-SOURCE-1",
    sourceVersion: "SYNTH-EDITION-1",
    pin: PIN,
    authorityTier: 1,
    storedAuthorityTier: "dafm_official",
    publisher: "SYNTH-PUBLISHER",
    title: "SYNTH terms",
    url: "https://example.invalid/synth-terms",
    publicationDate: "2031-01-01",
    publicationDateAbsentReason: null,
    retrievalDate: "2031-01-15",
    reviewRecord: null,
    contentFingerprintSha256: "a".repeat(64),
    archivedLocation: "docs/evidence/schemes/synth/terms.pdf",
    governsSchemeYear: 2031,
    contentScope: "WHOLE_DOCUMENT",
    ...overrides,
  };
}

function sourcePack(overrides: Partial<SchemeSourcePack> = {}): SchemeSourcePack {
  return {
    pin: PIN,
    sources: [source()],
    completeness: {
      status: "CLAIMED",
      coveredSourceIds: ["SYNTH-SOURCE-1"],
      reviewRecord: REVIEW,
    },
    ...overrides,
  };
}

function row(overrides: Partial<RequirementRegisterRow> = {}): RequirementRegisterRow {
  return {
    id: "SYNTH-REQ-1",
    pin: PIN,
    kind: "eligibility_condition",
    source: {
      sourceId: "SYNTH-SOURCE-1",
      sourceVersion: "SYNTH-EDITION-1",
      locator: "SYNTH section 1",
      wordingReference: "SYNTH section 1, first sentence",
    },
    applicability: "SYNTH applicants",
    dataKeys: [{ key: REGISTERED_KEY, owner: "cattle" }],
    status: "IMPLEMENTABLE",
    reason: null,
    engineRuleRef: null,
    testRef: null,
    ...overrides,
  };
}

function sealPack(
  overrides: Partial<Omit<SchemeContentPack, "contentFingerprintSha256">> = {},
): SchemeContentPack {
  const body = {
    formatVersion: 1 as const,
    pin: PIN,
    sourcePack: sourcePack(),
    register: { pin: PIN, rows: [row()] },
    supersedes: null,
    ...overrides,
  };
  return {
    ...body,
    contentFingerprintSha256: computeSchemeContentPackFingerprint(body, sha256),
  };
}

function definition(): StoredSchemeDefinition {
  return {
    version: {
      id: VERSION_ROW_ID,
      schemeKey: PIN.schemeKey,
      displayName: "SYNTH scheme",
      category: "other",
      authority: "DAFM",
      schemeYear: PIN.schemeYear,
      programmeGeneration: null,
      rulesVersion: PIN.rulesVersion,
      effectiveFrom: null,
      effectiveTo: null,
      applicationOpen: null,
      applicationClose: null,
      lateApplicationClose: null,
      publicationState: "draft",
      v1Enabled: false,
      enterpriseRelevance: [],
      supportType: null,
      recurrenceType: null,
      requiresAdviser: false,
      verifiedAt: null,
    },
    sources: [
      {
        id: SOURCE_ROW_ID,
        schemeVersionId: VERSION_ROW_ID,
        sourceKey: "SYNTH-SOURCE-1",
        authorityTier: "dafm_official",
        publisher: "SYNTH-PUBLISHER",
        title: "SYNTH terms",
        url: "https://example.invalid/synth-terms",
        publicationDate: "2031-01-01",
        retrievedAt: "2031-01-15T00:00:00.000Z",
        lastVerifiedAt: null,
        contentFingerprintSha256: "a".repeat(64),
        archivedStoragePath: "docs/evidence/schemes/synth/terms.pdf",
      },
    ],
    rules: [
      {
        id: RULE_ROW_ID,
        schemeVersionId: VERSION_ROW_ID,
        sourceId: SOURCE_ROW_ID,
        ruleKey: "synth-rule-1",
        ruleType: "eligibility",
        description: "SYNTH rule",
        operator: "exists",
        parameters: {},
        consequence: {},
        hardGate: true,
        effectiveFrom: null,
        effectiveTo: null,
        inputs: [
          {
            ruleId: RULE_ROW_ID,
            schemeVersionId: VERSION_ROW_ID,
            dataKey: REGISTERED_KEY,
            label: "SYNTH input",
            owner: "cattle",
            subjectScope: "animal",
            required: true,
            resolutionOwner: "farmer",
            priority: 10,
            routeKey: null,
          },
        ],
      },
    ],
  };
}

function sealPacket(
  overrides: Partial<Omit<SchemeSeedPacket, "packetFingerprintSha256">> = {},
  pack: SchemeContentPack = sealPack(),
): SchemeSeedPacket {
  const body = {
    formatVersion: 1 as const,
    pin: PIN,
    contentPackFingerprintSha256: pack.contentFingerprintSha256,
    definition: definition(),
    coverage: [
      {
        rowId: "SYNTH-REQ-1",
        status: "IMPLEMENTED" as const,
        reason: null,
        engineRuleRef: "synth-rule-1",
        testRef: "standard/validation.test.ts",
      },
    ],
    priorStoredVersion: null,
    ...overrides,
  };
  return {
    ...body,
    packetFingerprintSha256: computeSchemeSeedPacketFingerprint(body, sha256),
  };
}

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe("positive controls", () => {
  it("accepts a complete source pack, register, content pack and seed packet", () => {
    const pack = sealPack();
    expect(validateSchemeSourcePack(pack.sourcePack)).toEqual([]);
    expect(validateRequirementRegister(pack.register, pack.sourcePack)).toEqual([]);
    expect(validateSchemeContentPack(pack, sha256)).toEqual([]);
    expect(validateSchemeSeedPacket(sealPacket({}, pack), pack, sha256)).toEqual([]);
  });

  it.each([
    ["UNSUPPORTED", { status: "UNSUPPORTED" as const, reason: "SYNTH: no data feed" }],
    ["NOT_APPLICABLE", { status: "NOT_APPLICABLE" as const, reason: "SYNTH: no such class", dataKeys: [] }],
    [
      "IMPLEMENTED",
      { status: "IMPLEMENTED" as const, engineRuleRef: "synth-rule-1", testRef: "synth.test.ts" },
    ],
  ])("accepts a correctly formed %s row", (_label, overrides) => {
    expect(
      validateRequirementRegister({ pin: PIN, rows: [row(overrides)] }, sourcePack()),
    ).toEqual([]);
  });

  it("accepts an undated source only with a stated reason", () => {
    const undated = source({
      publicationDate: null,
      publicationDateAbsentReason: "SYNTH page carries no date",
    });
    expect(validateSchemeSourcePack(sourcePack({ sources: [undated] }))).toEqual([]);
  });

  it("accepts an extract in a claim only with a whole-document review record", () => {
    const extract = source({ contentScope: "EXTRACT", reviewRecord: REVIEW });
    expect(validateSchemeSourcePack(sourcePack({ sources: [extract] }))).toEqual([]);
  });
});

describe("required rejections", () => {
  const register = (rows: unknown[]) => ({ pin: PIN, rows });

  it.each<[string, () => unknown[], string]>([
    [
      "a row with no source",
      () => validateRequirementRegister(register([{ ...row(), source: undefined }]), sourcePack()),
      "REGISTER_ROW_NO_SOURCE",
    ],
    [
      "an unsupported row with no source",
      () =>
        validateRequirementRegister(
          register([{ ...row({ status: "UNSUPPORTED", reason: "SYNTH" }), source: null }]),
          sourcePack(),
        ),
      "REGISTER_ROW_NO_SOURCE",
    ],
    [
      "a source with no fingerprint (null)",
      () => validateSchemeSourcePack(sourcePack({ sources: [{ ...source(), contentFingerprintSha256: null as unknown as string }] })),
      "SOURCE_NO_FINGERPRINT",
    ],
    [
      "a source with no fingerprint (empty)",
      () => validateSchemeSourcePack(sourcePack({ sources: [source({ contentFingerprintSha256: "" })] })),
      "SOURCE_NO_FINGERPRINT",
    ],
    [
      "a source with a malformed fingerprint",
      () => validateSchemeSourcePack(sourcePack({ sources: [source({ contentFingerprintSha256: "A".repeat(64) })] })),
      "SOURCE_FINGERPRINT_MALFORMED",
    ],
    [
      "a source with no year",
      () => validateSchemeSourcePack(sourcePack({ sources: [{ ...source(), governsSchemeYear: undefined as unknown as number }] })),
      "SOURCE_NO_YEAR",
    ],
    [
      "a source with a non-year",
      () => validateSchemeSourcePack(sourcePack({ sources: [source({ governsSchemeYear: Number.NaN })] })),
      "SOURCE_NO_YEAR",
    ],
    [
      "a source governing another year",
      () => validateSchemeSourcePack(sourcePack({ sources: [source({ governsSchemeYear: 2032 })] })),
      "SOURCE_OTHER_YEAR",
    ],
    [
      "a source from another version",
      () => validateSchemeSourcePack(sourcePack({ sources: [source({ pin: OTHER_YEAR_PIN })] })),
      "SOURCE_OTHER_VERSION",
    ],
    [
      "duplicate row ids",
      () => validateRequirementRegister(register([row(), row()]), sourcePack()),
      "REGISTER_ROW_DUPLICATE_ID",
    ],
    [
      "duplicate row ids differing only by case",
      () => validateRequirementRegister(register([row(), row({ id: "synth-req-1" })]), sourcePack()),
      "REGISTER_ROW_DUPLICATE_ID",
    ],
    [
      "duplicate source ids",
      () => validateSchemeSourcePack(sourcePack({ sources: [source(), source()] })),
      "SOURCE_DUPLICATE_ID",
    ],
    [
      "an UNSUPPORTED row with no reason",
      () => validateRequirementRegister(register([row({ status: "UNSUPPORTED" })]), sourcePack()),
      "REGISTER_ROW_UNSUPPORTED_NO_REASON",
    ],
    [
      "an UNSUPPORTED row with a blank reason",
      () => validateRequirementRegister(register([row({ status: "UNSUPPORTED", reason: "   " })]), sourcePack()),
      "REGISTER_ROW_UNSUPPORTED_NO_REASON",
    ],
    [
      "a NOT_APPLICABLE row with no reason",
      () => validateRequirementRegister(register([row({ status: "NOT_APPLICABLE" })]), sourcePack()),
      "REGISTER_ROW_NOT_APPLICABLE_NO_REASON",
    ],
    [
      "a completeness claim with no review record",
      () =>
        validateSchemeSourcePack(
          sourcePack({
            completeness: {
              status: "CLAIMED",
              coveredSourceIds: ["SYNTH-SOURCE-1"],
              reviewRecord: null as unknown as typeof REVIEW,
            },
          }),
        ),
      "COMPLETENESS_NO_REVIEW_RECORD",
    ],
  ])("rejects %s", (_label, run, code) => {
    expect(codes(run() as { code: string }[])).toContain(code);
  });

  it.each<[string, SchemeSourcePack, string]>([
    [
      "a cited source with no fingerprint",
      sourcePack({ sources: [{ ...source(), contentFingerprintSha256: undefined as unknown as string }] }),
      "SOURCE_NO_FINGERPRINT",
    ],
    [
      "a cited source with no governed year",
      sourcePack({ sources: [{ ...source(), governsSchemeYear: undefined as unknown as number }] }),
      "SOURCE_NO_YEAR",
    ],
    [
      "a cited source governing another year",
      sourcePack({ sources: [source({ governsSchemeYear: 2032 })] }),
      "SOURCE_OTHER_YEAR",
    ],
    [
      "duplicate source ids",
      sourcePack({ sources: [source(), source()] }),
      "SOURCE_DUPLICATE_ID",
    ],
  ])("standalone register validation rejects %s", (_label, pack, expectedCode) => {
    const sourceIssues = codes(validateSchemeSourcePack(pack));
    expect(sourceIssues).toContain(expectedCode);
    expect(codes(validateRequirementRegister(register([row()]), pack))).toContain(expectedCode);
  });

  it("rejects a register-cited tier-3 extract omitted from completeness coverage", () => {
    const extract = source({
      sourceId: "SYNTH-SOURCE-3",
      sourceVersion: "SYNTH-EDITION-3",
      authorityTier: 3,
      storedAuthorityTier: "authoritative_secondary",
      contentScope: "EXTRACT",
      reviewRecord: null,
    });
    const sources = sourcePack({
      sources: [source(), extract],
      completeness: {
        status: "CLAIMED",
        coveredSourceIds: ["SYNTH-SOURCE-1"],
        reviewRecord: REVIEW,
      },
    });
    const cited = row({
      id: "SYNTH-REQ-3",
      source: {
        sourceId: extract.sourceId,
        sourceVersion: extract.sourceVersion,
        locator: "SYNTH section 3",
        wordingReference: "SYNTH section 3, first sentence",
      },
    });
    const register = { pin: PIN, rows: [row(), cited] };
    const pack = sealPack({ sourcePack: sources, register });

    expect(codes(validateRequirementRegister(register, sources))).toContain(
      "COMPLETENESS_REQUIRED_SOURCE_NOT_COVERED",
    );
    expect(codes(validateSchemeContentPack(pack, sha256))).toContain(
      "COMPLETENESS_REQUIRED_SOURCE_NOT_COVERED",
    );
    const seedIssues = validateSchemeSeedPacket(sealPacket({}, pack), pack, sha256);
    expect(codes(seedIssues)).toContain("SEED_CONTENT_PACK_INVALID");
    expect(seedIssues[0]?.detail).toContain("COMPLETENESS_REQUIRED_SOURCE_NOT_COVERED");
  });

  it("applies whole-document review checks once a cited extract is covered", () => {
    const extract = source({
      sourceId: "SYNTH-SOURCE-3",
      sourceVersion: "SYNTH-EDITION-3",
      authorityTier: 3,
      storedAuthorityTier: "authoritative_secondary",
      contentScope: "EXTRACT",
      reviewRecord: null,
    });
    const sources = sourcePack({
      sources: [source(), extract],
      completeness: {
        status: "CLAIMED",
        coveredSourceIds: ["SYNTH-SOURCE-1", "SYNTH-SOURCE-3"],
        reviewRecord: REVIEW,
      },
    });
    const cited = row({
      id: "SYNTH-REQ-3",
      source: {
        sourceId: extract.sourceId,
        sourceVersion: extract.sourceVersion,
        locator: "SYNTH section 3",
        wordingReference: "SYNTH section 3, first sentence",
      },
    });
    const pack = sealPack({ sourcePack: sources, register: { pin: PIN, rows: [row(), cited] } });

    expect(codes(validateSchemeContentPack(pack, sha256))).toContain(
      "COMPLETENESS_EXTRACT_NOT_REVIEWED",
    );
    const seedIssues = validateSchemeSeedPacket(sealPacket({}, pack), pack, sha256);
    expect(codes(seedIssues)).toContain("SEED_CONTENT_PACK_INVALID");
    expect(seedIssues[0]?.detail).toContain("COMPLETENESS_EXTRACT_NOT_REVIEWED");
  });

  it("carries each rejection through the content pack validator", () => {
    const cases: [Partial<SchemeContentPack>, string][] = [
      [{ register: { pin: PIN, rows: [{ ...row(), source: null as never }] } }, "REGISTER_ROW_NO_SOURCE"],
      [{ sourcePack: sourcePack({ sources: [source({ contentFingerprintSha256: "" })] }) }, "SOURCE_NO_FINGERPRINT"],
      [{ register: { pin: PIN, rows: [row(), row()] } }, "REGISTER_ROW_DUPLICATE_ID"],
      [{ register: { pin: PIN, rows: [row({ status: "UNSUPPORTED" })] } }, "REGISTER_ROW_UNSUPPORTED_NO_REASON"],
      [{ register: { pin: PIN, rows: [row({ status: "NOT_APPLICABLE" })] } }, "REGISTER_ROW_NOT_APPLICABLE_NO_REASON"],
    ];
    for (const [overrides, code] of cases) {
      expect(codes(validateSchemeContentPack(sealPack(overrides), sha256))).toContain(code);
    }
  });
});

describe("version isolation", () => {
  const packOtherVersion = sourcePack({ sources: [source({ pin: OTHER_YEAR_PIN })] });

  it("rejects a row citing a source pinned to another version", () => {
    expect(
      codes(validateRequirementRegister({ pin: PIN, rows: [row()] }, packOtherVersion)),
    ).toContain("REGISTER_ROW_SOURCE_OTHER_VERSION");
  });

  it("rejects a row citing another edition of its source", () => {
    const citation = { ...row().source, sourceVersion: "SYNTH-EDITION-2" };
    expect(
      codes(validateRequirementRegister({ pin: PIN, rows: [row({ source: citation })] }, sourcePack())),
    ).toContain("REGISTER_ROW_SOURCE_EDITION_MISMATCH");
  });

  it("rejects a row that belongs to another version", () => {
    expect(
      codes(validateRequirementRegister({ pin: PIN, rows: [row({ pin: OTHER_YEAR_PIN })] }, sourcePack())),
    ).toEqual(expect.arrayContaining(["REGISTER_ROW_OTHER_VERSION", "REGISTER_ROW_SOURCE_OTHER_VERSION"]));
  });

  it("rejects a register validated against another version's source pack", () => {
    const other = sourcePack({ pin: OTHER_YEAR_PIN, sources: [source({ pin: OTHER_YEAR_PIN, governsSchemeYear: 2032 })] });
    expect(
      codes(validateRequirementRegister({ pin: PIN, rows: [row()] }, other)),
    ).toContain("REGISTER_OTHER_VERSION");
  });

  it("rejects a content pack whose parts pin another version", () => {
    expect(
      codes(validateSchemeContentPack(sealPack({ register: { pin: OTHER_YEAR_PIN, rows: [] } }), sha256)),
    ).toContain("CONTENT_PACK_OTHER_VERSION");
  });

  it("does not resolve a row from a same-named source outside its pack", () => {
    const citation = { ...row().source, sourceId: "SYNTH-SOURCE-OTHER-PACK" };
    expect(
      codes(validateRequirementRegister({ pin: PIN, rows: [row({ source: citation })] }, sourcePack())),
    ).toContain("REGISTER_ROW_SOURCE_UNRESOLVED");
  });
});

describe("source pack details", () => {
  it.each<[string, Partial<SchemeSourceRecord>, string]>([
    ["an impossible date", { retrievalDate: "2031-02-30" }, "SOURCE_DATE_INVALID"],
    ["an undated source with no reason", { publicationDate: null }, "SOURCE_DATE_INVALID"],
    ["publication after retrieval", { publicationDate: "2031-03-01" }, "SOURCE_DATE_ORDER"],
    ["review before retrieval", { reviewRecord: { ...REVIEW, reviewedOn: "2031-01-14" } }, "SOURCE_DATE_ORDER"],
    ["an incomplete review record", { reviewRecord: { ...REVIEW, reviewer: "" } }, "SOURCE_REVIEW_RECORD_INVALID"],
    ["a path escaping the archive", { archivedLocation: "../outside.pdf" }, "SOURCE_FIELD_INVALID"],
    ["a non-http URL", { url: "file:///synth" }, "SOURCE_FIELD_INVALID"],
    ["a mismatched tier pair", { authorityTier: 4, storedAuthorityTier: "statute" }, "SOURCE_TIER_INVALID"],
    ["an unknown tier", { authorityTier: 5 as never }, "SOURCE_TIER_INVALID"],
  ])("rejects %s", (_label, overrides, code) => {
    expect(
      codes(validateSchemeSourcePack(sourcePack({ sources: [source(overrides)] }))),
    ).toContain(code);
  });

  it("rejects an empty pack rather than treating it as complete", () => {
    expect(codes(validateSchemeSourcePack(sourcePack({ sources: [] })))).toContain("SOURCE_PACK_EMPTY");
  });

  it("rejects a pack that does not state its completeness at all", () => {
    expect(
      codes(validateSchemeSourcePack({ ...sourcePack(), completeness: undefined })),
    ).toContain("COMPLETENESS_STATE_INVALID");
  });

  it("requires a reason for not claiming completeness", () => {
    expect(
      codes(validateSchemeSourcePack(sourcePack({ completeness: { status: "NOT_CLAIMED", reason: " " } }))),
    ).toContain("COMPLETENESS_STATE_INVALID");
    expect(
      validateSchemeSourcePack(sourcePack({ completeness: { status: "NOT_CLAIMED", reason: "SYNTH: terms absent" } })),
    ).toEqual([]);
  });

  const claim = (overrides: object) => ({
    status: "CLAIMED" as const,
    coveredSourceIds: ["SYNTH-SOURCE-1"],
    reviewRecord: REVIEW,
    ...overrides,
  });

  it.each<[string, Partial<SchemeSourcePack>, string]>([
    ["a review limited to listed facts", { completeness: claim({ reviewRecord: { ...REVIEW, scope: "LISTED_FACTS_ONLY" } }) }, "COMPLETENESS_REVIEW_RECORD_INVALID"],
    ["no covered sources", { completeness: claim({ coveredSourceIds: [] }) }, "COMPLETENESS_NO_SOURCES"],
    ["an unresolved covered source", { completeness: claim({ coveredSourceIds: ["SYNTH-SOURCE-1", "SYNTH-NOPE"] }) }, "COMPLETENESS_SOURCE_UNRESOLVED"],
    ["an extract with no whole-document review", { sources: [source({ contentScope: "EXTRACT" })] }, "COMPLETENESS_EXTRACT_NOT_REVIEWED"],
    ["an extract reviewed for listed facts only", { sources: [source({ contentScope: "EXTRACT", reviewRecord: { ...REVIEW, scope: "LISTED_FACTS_ONLY" } })] }, "COMPLETENESS_EXTRACT_NOT_REVIEWED"],
    ["only lower-tier sources", { sources: [source({ authorityTier: 3, storedAuthorityTier: "authoritative_secondary" })] }, "COMPLETENESS_NO_AUTHORITATIVE_SOURCE"],
    ["a tier 1 source left out", { sources: [source(), source({ sourceId: "SYNTH-SOURCE-2" })] }, "COMPLETENESS_AUTHORITATIVE_SOURCE_NOT_COVERED"],
    ["a claim reviewed before retrieval", { completeness: claim({ reviewRecord: { ...REVIEW, reviewedOn: "2031-01-14" } }) }, "SOURCE_DATE_ORDER"],
  ])("rejects a claim with %s", (_label, overrides, code) => {
    expect(codes(validateSchemeSourcePack(sourcePack(overrides)))).toContain(code);
  });
});

describe("register details", () => {
  const validate = (...rows: unknown[]) =>
    codes(validateRequirementRegister({ pin: PIN, rows }, sourcePack()));

  it.each<[string, Partial<RequirementRegisterRow>, string]>([
    ["an unknown kind", { kind: "guess" as never }, "REGISTER_ROW_KIND_INVALID"],
    ["an unknown status", { status: "LIVE" as never }, "REGISTER_ROW_STATUS_INVALID"],
    ["a blank applicability", { applicability: " " }, "REGISTER_ROW_NO_APPLICABILITY"],
    ["no locator", { source: { ...row().source, locator: "" } }, "REGISTER_ROW_SOURCE_INCOMPLETE"],
    ["no wording reference", { source: { ...row().source, wordingReference: "" } }, "REGISTER_ROW_SOURCE_INCOMPLETE"],
    ["an implemented row with no test", { status: "IMPLEMENTED", engineRuleRef: "synth-rule-1" }, "REGISTER_ROW_IMPLEMENTED_NO_REFERENCE"],
    ["an implemented row with no engine rule", { status: "IMPLEMENTED", testRef: "synth.test.ts" }, "REGISTER_ROW_IMPLEMENTED_NO_REFERENCE"],
    ["an unbuilt row citing an engine rule", { engineRuleRef: "synth-rule-1" }, "REGISTER_ROW_REFERENCE_NOT_ALLOWED"],
    ["a NOT_APPLICABLE row citing a test", { status: "NOT_APPLICABLE", reason: "SYNTH", testRef: "synth.test.ts" }, "REGISTER_ROW_REFERENCE_NOT_ALLOWED"],
    ["a reason on an implementable row", { reason: "SYNTH" }, "REGISTER_ROW_REASON_NOT_ALLOWED"],
    ["an owner disagreeing with the registry", { dataKeys: [{ key: REGISTERED_KEY, owner: "schemes" }] }, "REGISTER_ROW_DATA_KEY_OWNER_MISMATCH"],
    ["a canonical fact claimed by Schemes", { dataKeys: [{ key: "cattle.synth.new_fact", owner: "schemes" }] }, "REGISTER_ROW_DATA_KEY_OWNER_MISMATCH"],
    ["a scheme key claimed by another owner", { dataKeys: [{ key: "schemes.synth.fact", owner: "cattle" }] }, "REGISTER_ROW_DATA_KEY_OWNER_MISMATCH"],
    ["an unknown owner", { dataKeys: [{ key: REGISTERED_KEY, owner: "toString" as never }] }, "REGISTER_ROW_DATA_KEY_INVALID"],
    ["an implemented row reading an unregistered key", { status: "IMPLEMENTED", engineRuleRef: "r", testRef: "t", dataKeys: [{ key: "schemes.synth.fact", owner: "schemes" }] }, "REGISTER_ROW_DATA_KEY_UNREGISTERED"],
  ])("rejects %s", (_label, overrides, code) => {
    expect(validate(row(overrides))).toContain(code);
  });

  it("rejects missing fields rather than reading them as null", () => {
    expect(validate({ ...row({ status: "IMPLEMENTED", engineRuleRef: "r", testRef: "t" }), reason: undefined })).toContain("REGISTER_ROW_REASON_NOT_ALLOWED");
    expect(validate({ ...row(), dataKeys: undefined })).toContain("REGISTER_ROW_DATA_KEY_INVALID");
    expect(validate({ ...row(), engineRuleRef: undefined })).toContain("REGISTER_ROW_REFERENCE_INVALID");
  });

  it("rejects two rows claiming different owners for one proposed key", () => {
    expect(
      validate(
        row({ dataKeys: [{ key: "synth.shared_fact", owner: "fields" }] }),
        row({ id: "SYNTH-REQ-2", dataKeys: [{ key: "synth.shared_fact", owner: "cattle" }] }),
      ),
    ).toContain("REGISTER_ROW_DATA_KEY_OWNER_CONFLICT");
  });

  it("accepts a proposed scheme-owned key on a row not yet implemented", () => {
    expect(validate(row({ dataKeys: [{ key: "schemes.synth.2031.fact", owner: "schemes" }] }))).toEqual([]);
  });

  it("rejects a tier 4 source carrying a requirement", () => {
    const pack = sourcePack({
      sources: [source(), source({ sourceId: "SYNTH-ADVISORY", authorityTier: 4, storedAuthorityTier: "teagasc_technical" })],
    });
    const citation = { ...row().source, sourceId: "SYNTH-ADVISORY" };
    expect(
      codes(validateRequirementRegister({ pin: PIN, rows: [row({ source: citation })] }, pack)),
    ).toContain("REGISTER_ROW_ADVISORY_SOURCE");
  });

  it("rejects an empty register", () => {
    expect(validate()).toContain("REGISTER_EMPTY");
  });
});

describe("content pack", () => {
  it("fails when a row is removed or a source fingerprint altered after sealing", () => {
    const sealed = sealPack({
      register: { pin: PIN, rows: [row(), row({ id: "SYNTH-REQ-2" })] },
    });
    expect(validateSchemeContentPack(sealed, sha256)).toEqual([]);

    const rowRemoved = { ...sealed, register: { pin: PIN, rows: [row()] } };
    expect(codes(validateSchemeContentPack(rowRemoved, sha256))).toEqual(["CONTENT_PACK_FINGERPRINT_MISMATCH"]);

    const sourceAltered = {
      ...sealed,
      sourcePack: sourcePack({ sources: [source({ contentFingerprintSha256: "b".repeat(64) })] }),
    };
    expect(codes(validateSchemeContentPack(sourceAltered, sha256))).toEqual(["CONTENT_PACK_FINGERPRINT_MISMATCH"]);
  });

  it("gives the same fingerprint for reordered object keys and a different one for reordered rows", () => {
    const a = row();
    const b = row({ id: "SYNTH-REQ-2" });
    const fingerprint = (rows: RequirementRegisterRow[]) =>
      sealPack({ register: { pin: PIN, rows } }).contentFingerprintSha256;
    const reversedKeys = Object.fromEntries(Object.entries(a).reverse()) as unknown as RequirementRegisterRow;

    expect(fingerprint([a, b])).toBe(fingerprint([reversedKeys, b]));
    expect(fingerprint([a, b])).not.toBe(fingerprint([b, a]));
  });

  it("requires a completeness claim to freeze a register", () => {
    const pack = sealPack({
      sourcePack: sourcePack({ completeness: { status: "NOT_CLAIMED", reason: "SYNTH" } }),
    });
    expect(codes(validateSchemeContentPack(pack, sha256))).toEqual(["CONTENT_PACK_NO_COMPLETENESS_CLAIM"]);
  });

  it("refuses a stub hash that would make different content verify", () => {
    const stub = () => "a".repeat(64);
    const body = { ...sealPack() };
    const forged = { ...body, contentFingerprintSha256: "a".repeat(64) };
    expect(codes(validateSchemeContentPack(forged, stub))).toEqual(["CONTENT_PACK_FINGERPRINT_UNVERIFIABLE"]);
  });

  it.each<[string, SchemeContentPack["supersedes"], string[]]>([
    ["another version of the scheme", { pin: OTHER_YEAR_PIN, contentFingerprintSha256: "b".repeat(64) }, []],
    ["itself", { pin: PIN, contentFingerprintSha256: "b".repeat(64) }, ["CONTENT_PACK_SUPERSESSION_INVALID"]],
    ["another scheme", { pin: { ...OTHER_YEAR_PIN, schemeKey: "synth-other" }, contentFingerprintSha256: "b".repeat(64) }, ["CONTENT_PACK_SUPERSESSION_INVALID"]],
    ["no fingerprint", { pin: OTHER_YEAR_PIN, contentFingerprintSha256: "" }, ["CONTENT_PACK_SUPERSESSION_INVALID"]],
  ])("handles superseding %s", (_label, supersedes, expected) => {
    expect(codes(validateSchemeContentPack(sealPack({ supersedes }), sha256))).toEqual(expected);
  });

  it.each([
    ["null", null],
    ["a string", "pack"],
    ["an array", []],
    ["an empty object", {}],
    ["an undefined-bearing pack", { ...sealPack(), supersedes: undefined }],
  ])("reports %s as issues without throwing", (_label, input) => {
    expect(validateSchemeContentPack(input, sha256).length).toBeGreaterThan(0);
    expect(validateSchemeSeedPacket(input, input, sha256).length).toBeGreaterThan(0);
    expect(validateSchemeSourcePack(input).length).toBeGreaterThan(0);
    expect(validateRequirementRegister(input, input).length).toBeGreaterThan(0);
  });

  it("assert throws on an invalid pack and passes a valid one", () => {
    expect(() => assertSchemeContentPack(sealPack(), sha256)).not.toThrow();
    expect(() => assertSchemeContentPack({ ...sealPack(), contentFingerprintSha256: "b".repeat(64) }, sha256))
      .toThrow("INVALID_SCHEME_CONTENT_PACK:CONTENT_PACK_FINGERPRINT_MISMATCH");
  });
});

describe("register coverage", () => {
  const rows = [
    row(),
    row({ id: "SYNTH-REQ-2", status: "UNSUPPORTED", reason: "SYNTH" }),
    row({ id: "SYNTH-REQ-3", status: "NOT_APPLICABLE", reason: "SYNTH" }),
  ];
  const implemented = { rowId: "SYNTH-REQ-1", status: "IMPLEMENTED" as const, reason: null, engineRuleRef: "r", testRef: "t" };
  const unsupported = { rowId: "SYNTH-REQ-2", status: "UNSUPPORTED" as const, reason: "SYNTH", engineRuleRef: null, testRef: null };
  const notApplicable = { rowId: "SYNTH-REQ-3", status: "NOT_APPLICABLE" as const, reason: "SYNTH", engineRuleRef: null, testRef: null };
  const all = [implemented, unsupported, notApplicable];

  it("accepts a final status for every row", () => {
    expect(validateRegisterCoverage(all, rows)).toEqual([]);
  });

  it("lets a buildable row end UNSUPPORTED with a reason", () => {
    expect(
      validateRegisterCoverage([{ ...unsupported, rowId: "SYNTH-REQ-1" }, unsupported, notApplicable], rows),
    ).toEqual([]);
  });

  it.each<[string, unknown[], string]>([
    ["a row with no entry", [implemented, unsupported], "COVERAGE_ROW_MISSING"],
    ["a rule the register does not hold", [...all, { ...implemented, rowId: "SYNTH-EXTRA" }], "COVERAGE_ROW_UNKNOWN"],
    ["a duplicate entry", [...all, implemented], "COVERAGE_ROW_DUPLICATE"],
    ["a status that is not final", [{ ...implemented, status: "IMPLEMENTABLE" }, unsupported, notApplicable], "COVERAGE_ROW_NOT_FINAL"],
    ["an unsupported row promoted to implemented", [implemented, { ...implemented, rowId: "SYNTH-REQ-2" }, notApplicable], "COVERAGE_TRANSITION_NOT_ALLOWED"],
    ["no reason on UNSUPPORTED", [{ ...unsupported, rowId: "SYNTH-REQ-1", reason: null }, unsupported, notApplicable], "COVERAGE_UNSUPPORTED_NO_REASON"],
    ["no reason on NOT_APPLICABLE", [implemented, unsupported, { ...notApplicable, reason: "" }], "COVERAGE_NOT_APPLICABLE_NO_REASON"],
    ["implemented with no test", [{ ...implemented, testRef: null }, unsupported, notApplicable], "COVERAGE_IMPLEMENTED_NO_REFERENCE"],
    ["a reason on an implemented row", [{ ...implemented, reason: "SYNTH" }, unsupported, notApplicable], "COVERAGE_REASON_NOT_ALLOWED"],
    ["a reference on a NOT_APPLICABLE row", [implemented, unsupported, { ...notApplicable, testRef: "t" }], "COVERAGE_REFERENCE_INVALID"],
  ])("rejects %s", (_label, entries, code) => {
    expect(codes(validateRegisterCoverage(entries, rows))).toContain(code);
  });

  describe("frozen final-status rows", () => {
    const frozenImplemented = row({
      status: "IMPLEMENTED",
      engineRuleRef: "synth-frozen-rule",
      testRef: "synth-frozen.test.ts",
    });
    const frozenUnsupported = row({
      status: "UNSUPPORTED",
      reason: "SYNTH: no data feed",
      engineRuleRef: "synth-frozen-rule",
      testRef: "synth-frozen.test.ts",
    });
    const frozenNotApplicable = row({ status: "NOT_APPLICABLE", reason: "SYNTH: no such class" });
    const entryFor = (frozen: RequirementRegisterRow) => ({
      rowId: frozen.id,
      status: frozen.status,
      reason: frozen.reason,
      engineRuleRef: frozen.engineRuleRef,
      testRef: frozen.testRef,
    });

    it.each([
      ["IMPLEMENTED", frozenImplemented],
      ["UNSUPPORTED", frozenUnsupported],
      ["NOT_APPLICABLE", frozenNotApplicable],
    ])("accepts a %s row restated exactly", (_label, frozen) => {
      expect(validateRegisterCoverage([entryFor(frozen)], [frozen])).toEqual([]);
    });

    it.each<[string, RequirementRegisterRow, object]>([
      ["an implemented row's engine rule", frozenImplemented, { engineRuleRef: "synth-other-rule" }],
      ["an implemented row's test", frozenImplemented, { testRef: "synth-other.test.ts" }],
      ["an unsupported row's engine rule", frozenUnsupported, { engineRuleRef: "synth-other-rule" }],
      ["an unsupported row's dropped test", frozenUnsupported, { testRef: null }],
      ["an unsupported row's reason", frozenUnsupported, { reason: "SYNTH: another reason" }],
      ["a not-applicable row's reason", frozenNotApplicable, { reason: "SYNTH: another reason" }],
    ])("rejects replacing %s", (_label, frozen, change) => {
      expect(
        codes(validateRegisterCoverage([{ ...entryFor(frozen), ...change }], [frozen])),
      ).toContain("COVERAGE_FROZEN_ROW_DRIFT");
    });

    it("rejects any field of any final-status row drifting", () => {
      for (const frozen of [frozenImplemented, frozenUnsupported, frozenNotApplicable]) {
        for (const field of ["reason", "engineRuleRef", "testRef"] as const) {
          const entry = { ...entryFor(frozen), [field]: "SYNTH-DRIFTED" };
          expect(codes(validateRegisterCoverage([entry], [frozen]))).toContain("COVERAGE_FROZEN_ROW_DRIFT");
        }
      }
    });

    it("still lets the allowed transitions from an unbuilt row assign references", () => {
      const unbuilt = row();
      expect(validateRegisterCoverage([implemented], [unbuilt])).toEqual([]);
      expect(
        validateRegisterCoverage([{ ...unsupported, rowId: unbuilt.id, engineRuleRef: "r", testRef: "t" }], [unbuilt]),
      ).toEqual([]);
    });
  });

  it("rejects an implemented entry whose row reads an unregistered key", () => {
    const proposed = [row({ dataKeys: [{ key: "schemes.synth.2031.fact", owner: "schemes" }] })];
    expect(codes(validateRegisterCoverage([implemented], proposed))).toContain("COVERAGE_DATA_KEY_UNREGISTERED");
  });

  it("rejects a frozen row whose registered data key names the wrong canonical owner", () => {
    const proposed = [row({ dataKeys: [{ key: "cattle.animal.weight", owner: "fields" }] })];
    expect(codes(validateRegisterCoverage([implemented], proposed))).toContain(
      "REGISTER_ROW_DATA_KEY_OWNER_MISMATCH",
    );
  });

  it("rejects conflicting ownership for the same data key across frozen rows", () => {
    const proposed = [
      row({ dataKeys: [{ key: "synth.shared.fact", owner: "fields" }] }),
      row({ id: "SYNTH-REQ-2", dataKeys: [{ key: "synth.shared.fact", owner: "cattle" }] }),
    ];
    const entries = [implemented, { ...implemented, rowId: "SYNTH-REQ-2" }];
    expect(codes(validateRegisterCoverage(entries, proposed))).toContain(
      "REGISTER_ROW_DATA_KEY_OWNER_CONFLICT",
    );
  });
});

describe("seed packet", () => {
  const withDefinition = (change: (value: StoredSchemeDefinition) => void) => {
    const value = definition();
    change(value);
    return validateSchemeSeedPacket(sealPacket({ definition: value }), sealPack(), sha256);
  };

  it.each<[string, (value: StoredSchemeDefinition) => void, string]>([
    ["a verified version", (d) => { d.version.publicationState = "verified"; d.version.verifiedAt = "2031-02-02T00:00:00.000Z"; }, "SEED_PUBLICATION_STATE_NOT_ALLOWED"],
    ["an enabled version", (d) => { d.version.v1Enabled = true; }, "SEED_PUBLICATION_STATE_NOT_ALLOWED"],
    ["another scheme year", (d) => { d.version.schemeYear = 2032; }, "SEED_OTHER_VERSION"],
    ["a source row of another version", (d) => { d.sources[0].schemeVersionId = OTHER_VERSION_ROW_ID; }, "SEED_ROW_OTHER_VERSION"],
    ["a rule of another version", (d) => { d.rules[0].schemeVersionId = OTHER_VERSION_ROW_ID; }, "SEED_ROW_OTHER_VERSION"],
    ["an input of another version", (d) => { d.rules[0].inputs[0].schemeVersionId = OTHER_VERSION_ROW_ID; }, "SEED_ROW_OTHER_VERSION"],
    ["a source differing from the pack", (d) => { d.sources[0].contentFingerprintSha256 = "b".repeat(64); }, "SEED_SOURCE_MISMATCH"],
    ["a retrieval date differing from the pack", (d) => { d.sources[0].retrievedAt = "2031-01-16T00:00:00.000Z"; }, "SEED_SOURCE_MISMATCH"],
    ["a source not in the pack", (d) => { d.sources[0].sourceKey = "SYNTH-NOT-IN-PACK"; }, "SEED_SOURCE_NOT_IN_PACK"],
    ["a pack source with no row", (d) => { d.sources = []; }, "SEED_SOURCE_MISSING"],
    ["a duplicate rule key", (d) => { d.rules.push({ ...d.rules[0], id: RULE_ROW_ID_2 }); }, "SEED_DUPLICATE_KEY"],
    ["a rule with no register row", (d) => { d.rules.push({ ...d.rules[0], id: RULE_ROW_ID_2, ruleKey: "synth-unregistered", inputs: [] }); }, "SEED_RULE_NOT_IN_REGISTER"],
    ["a cited rule the packet does not load", (d) => { d.rules[0].ruleKey = "synth-renamed"; }, "SEED_RULE_REFERENCE_UNRESOLVED"],
    ["a row's fact missing from its rule", (d) => { d.rules[0].inputs = []; }, "SEED_ROW_KEY_NOT_IN_RULE"],
    ["a rule reading a fact its row does not name", (d) => { d.rules[0].inputs.push({ ...d.rules[0].inputs[0], dataKey: "cattle.animal.date_of_birth" }); }, "SEED_RULE_INPUT_NOT_IN_REGISTER"],
    ["a rule whose source is unresolved (shared validator)", (d) => { d.rules[0].sourceId = OTHER_VERSION_ROW_ID; }, "SEED_DEFINITION_INVALID"],
    ["an unregistered rule input (shared validator)", (d) => { d.rules[0].inputs[0].dataKey = "random.freeform.answer"; }, "SEED_DEFINITION_INVALID"],
  ])("rejects %s", (_label, change, code) => {
    expect(codes(withDefinition(change))).toContain(code);
  });

  it("rejects coverage replacing the frozen register's implementation references", () => {
    const frozen = row({
      status: "IMPLEMENTED",
      engineRuleRef: "synth-frozen-rule",
      testRef: "synth-frozen.test.ts",
    });
    const pack = sealPack({ register: { pin: PIN, rows: [frozen] } });
    const value = definition();
    value.rules[0].ruleKey = "synth-frozen-rule";
    const entry = {
      rowId: frozen.id,
      status: "IMPLEMENTED" as const,
      reason: null,
      engineRuleRef: "synth-frozen-rule",
      testRef: "synth-frozen.test.ts",
    };
    const seal = (coverage: SchemeSeedPacket["coverage"]) =>
      validateSchemeSeedPacket(sealPacket({ definition: value, coverage }, pack), pack, sha256);

    expect(seal([entry])).toEqual([]);

    const renamed = definition();
    expect(
      codes(validateSchemeSeedPacket(
        sealPacket({ definition: renamed, coverage: [{ ...entry, engineRuleRef: "synth-rule-1", testRef: "synth-other.test.ts" }] }, pack),
        pack,
        sha256,
      )),
    ).toEqual(["COVERAGE_FROZEN_ROW_DRIFT"]);
  });

  describe("stored row fields", () => {
    const input = (d: StoredSchemeDefinition) => d.rules[0].inputs[0];

    it.each<[string, (value: StoredSchemeDefinition) => void]>([
      ["a version id that is not a uuid", (d) => { d.version.id = "not-a-uuid"; d.sources[0].schemeVersionId = "not-a-uuid"; d.rules[0].schemeVersionId = "not-a-uuid"; input(d).schemeVersionId = "not-a-uuid"; }],
      ["a blank display name", (d) => { d.version.displayName = " "; }],
      ["an overlong display name", (d) => { d.version.displayName = "x".repeat(181); }],
      ["an unknown category", (d) => { d.version.category = "guess"; }],
      ["an unknown authority", (d) => { d.version.authority = "toString"; }],
      ["an impossible effective date", (d) => { d.version.effectiveFrom = "2031-02-30"; }],
      ["a timestamp as an effective date", (d) => { d.version.effectiveTo = "2031-02-01T00:00:00Z"; }],
      ["an invalid application timestamp", (d) => { d.version.applicationOpen = "2031-01-01"; }],
      ["an effective window ending before it starts", (d) => { d.version.effectiveFrom = "2031-02-01"; d.version.effectiveTo = "2031-01-01"; }],
      ["an application window closing before it opens", (d) => { d.version.applicationOpen = "2031-02-01T00:00:00Z"; d.version.applicationClose = "2031-01-01T00:00:00Z"; }],
      ["a late close before the close", (d) => { d.version.applicationClose = "2031-02-01T00:00:00Z"; d.version.lateApplicationClose = "2031-01-01T00:00:00Z"; }],
      ["non-text enterprise relevance", (d) => { d.version.enterpriseRelevance = [1 as unknown as string]; }],
      ["a non-boolean adviser flag", (d) => { d.version.requiresAdviser = "no" as unknown as boolean; }],
      ["an invalid last-verified timestamp", (d) => { d.sources[0].lastVerifiedAt = "yesterday"; }],
      ["an overlong source key", (d) => { d.sources[0].sourceKey = "x".repeat(121); }],
      ["a duplicate source row id", (d) => { d.sources.push({ ...d.sources[0], sourceKey: "SYNTH-SOURCE-1-COPY" }); }],
      ["an unknown rule type", (d) => { d.rules[0].ruleType = "guess" as never; }],
      ["a blank rule description", (d) => { d.rules[0].description = ""; }],
      ["a blank operator", (d) => { d.rules[0].operator = " "; }],
      ["array parameters", (d) => { d.rules[0].parameters = [] as unknown as Record<string, unknown>; }],
      ["a null consequence", (d) => { d.rules[0].consequence = null as unknown as Record<string, unknown>; }],
      ["a non-boolean hard gate", (d) => { d.rules[0].hardGate = 1 as unknown as boolean; }],
      ["an invalid rule timestamp", (d) => { d.rules[0].effectiveFrom = "2031-02-30T00:00:00Z"; }],
      ["a rule window ending before it starts", (d) => { d.rules[0].effectiveFrom = "2031-02-01T00:00:00Z"; d.rules[0].effectiveTo = "2031-01-01T00:00:00Z"; }],
      ["a blank input label", (d) => { input(d).label = " "; }],
      ["an unknown subject scope", (d) => { input(d).subjectScope = "herd" as never; }],
      ["a non-boolean required flag", (d) => { input(d).required = "yes" as unknown as boolean; }],
      ["an unknown resolution owner", (d) => { input(d).resolutionOwner = "nobody" as never; }],
      ["a fractional priority", (d) => { input(d).priority = 1.5; }],
      ["a priority out of range", (d) => { input(d).priority = 10001; }],
      ["a blank route key", (d) => { input(d).routeKey = " "; }],
      ["an application window reversed below a millisecond", (d) => { d.version.applicationOpen = "2031-01-01T00:00:00.000999Z"; d.version.applicationClose = "2031-01-01T00:00:00.000001Z"; }],
      ["a late close before the close below a millisecond", (d) => { d.version.applicationClose = "2031-01-01T00:00:00.000999Z"; d.version.lateApplicationClose = "2031-01-01T00:00:00.000001Z"; }],
      ["a rule window reversed below a millisecond", (d) => { d.rules[0].effectiveFrom = "2031-01-01T00:00:00.000999Z"; d.rules[0].effectiveTo = "2031-01-01T00:00:00.000001Z"; }],
      ["a window reversed against an unpadded fraction", (d) => { d.rules[0].effectiveFrom = "2031-01-01T00:00:00.1Z"; d.rules[0].effectiveTo = "2031-01-01T00:00:00.099999Z"; }],
      ["a window reversed against a whole second", (d) => { d.rules[0].effectiveFrom = "2031-01-01T00:00:00.000001Z"; d.rules[0].effectiveTo = "2031-01-01T00:00:00Z"; }],
      ["a timestamp finer than the database stores", (d) => { d.version.applicationOpen = "2031-01-01T00:00:00.0000001Z"; }],
      ["a timestamp in year zero", (d) => { d.version.applicationOpen = "0000-01-01T00:00:00Z"; }],
      ["a date in year zero", (d) => { d.version.effectiveFrom = "0000-01-01"; }],
      ["text over its bound once only spaces are stripped", (d) => { d.version.displayName = `${"x".repeat(180)}\t`; }],
    ])("rejects %s", (_label, change) => {
      expect(codes(withDefinition(change))).toEqual(
        expect.arrayContaining([expect.stringMatching(/^SEED_(ROW_FIELD_INVALID|DUPLICATE_KEY)$/)]),
      );
    });

    it("accepts windows ordered or equal at microsecond precision", () => {
      expect(
        withDefinition((d) => {
          d.version.applicationOpen = "2031-01-01T00:00:00.000001Z";
          d.version.applicationClose = "2031-01-01T00:00:00.000999Z";
          d.version.lateApplicationClose = "2031-01-01T00:00:00.000999Z";
          d.rules[0].effectiveFrom = "2031-01-01T00:00:00.1Z";
          d.rules[0].effectiveTo = "2031-01-01T00:00:00.100000Z";
        }),
      ).toEqual([]);
    });

    it("measures text bounds as the database does", () => {
      expect(
        withDefinition((d) => {
          d.version.displayName = `  ${"\u{1F33E}".repeat(180)}  `;
        }),
      ).toEqual([]);
    });

    // Every text column of every row, plus the nested stored JSON, for each
    // value the database would refuse or could not hold exactly.
    const textColumns: [string, (d: StoredSchemeDefinition, value: string) => void][] = [
      ["version.displayName", (d, value) => { d.version.displayName = value; }],
      ["version.rulesVersion", (d, value) => { d.version.rulesVersion = value; }],
      ["version.programmeGeneration", (d, value) => { d.version.programmeGeneration = value; }],
      ["version.supportType", (d, value) => { d.version.supportType = value; }],
      ["version.recurrenceType", (d, value) => { d.version.recurrenceType = value; }],
      ["version.enterpriseRelevance", (d, value) => { d.version.enterpriseRelevance = [value]; }],
      ["source.sourceKey", (d, value) => { d.sources[0].sourceKey = value; }],
      ["source.publisher", (d, value) => { d.sources[0].publisher = value; }],
      ["source.title", (d, value) => { d.sources[0].title = value; }],
      ["source.url", (d, value) => { d.sources[0].url = `https://example.invalid/${value}`; }],
      ["source.archivedStoragePath", (d, value) => { d.sources[0].archivedStoragePath = value; }],
      ["rule.ruleKey", (d, value) => { d.rules[0].ruleKey = value; }],
      ["rule.description", (d, value) => { d.rules[0].description = value; }],
      ["rule.operator", (d, value) => { d.rules[0].operator = value; }],
      ["rule.parameters value", (d, value) => { d.rules[0].parameters = { synth: value }; }],
      ["rule.parameters key", (d, value) => { d.rules[0].parameters = { [value]: true }; }],
      ["rule.parameters nested value", (d, value) => { d.rules[0].parameters = { synth: [{ nested: [value] }] }; }],
      ["rule.consequence nested value", (d, value) => { d.rules[0].consequence = { synth: { nested: value } }; }],
      ["input.dataKey", (d, value) => { input(d).dataKey = value; }],
      ["input.label", (d, value) => { input(d).label = value; }],
      ["input.routeKey", (d, value) => { input(d).routeKey = value; }],
    ];
    const unstorableText: [string, string][] = [
      ["a NUL", "synth\0text"],
      ["a lone high surrogate", "synth\uD83Dtext"],
      ["a lone low surrogate", "synth\uDF3Etext"],
    ];

    it.each(
      textColumns.flatMap(([column, set]) =>
        unstorableText.map(([label, value]) => [column, label, value, set] as const),
      ),
    )("rejects %s holding %s", (_column, _label, value, set) => {
      expect(codes(withDefinition((d) => set(d, value)))).toContain("SEED_ROW_FIELD_INVALID");
    });

    it("accepts a paired surrogate in text and nested JSON", () => {
      expect(
        withDefinition((d) => {
          d.version.displayName = "SYNTH \u{1F33E}";
          d.rules[0].parameters = { "\u{1F33E}": ["\u{1F33E}", 1.5, true, null] };
        }),
      ).toEqual([]);
    });

    it.each<[string, () => unknown]>([
      ["a non-finite number", () => ({ synth: [Number.POSITIVE_INFINITY] })],
      ["NaN", () => ({ synth: Number.NaN })],
      ["an undefined value", () => ({ synth: undefined })],
      ["an array hole", () => ({ synth: new Array(1) })],
      ["a Date", () => ({ synth: new Date(0) })],
      ["a function", () => ({ synth: () => null })],
      ["a cycle", () => { const value: Record<string, unknown> = {}; value.self = value; return value; }],
      ["nesting past the call stack", () => {
        const value: Record<string, unknown> = {};
        let current = value;
        for (let depth = 0; depth < 200_000; depth += 1) {
          const next: Record<string, unknown> = {};
          current.nested = next;
          current = next;
        }
        return value;
      }],
    ])("rejects stored JSON holding %s without throwing", (_label, build) => {
      const packet = sealPacket({ definition: definition() });
      packet.definition.rules[0].parameters = build() as Record<string, unknown>;
      const found = validateSchemeSeedPacket(packet, sealPack(), sha256);
      expect(found.map((issue) => issue.code)).toContain("SEED_ROW_FIELD_INVALID");
    });

    it("rejects a duplicate input, rule row id and version-scoped key", () => {
      expect(codes(withDefinition((d) => { d.rules[0].inputs.push({ ...input(d) }); }))).toContain("SEED_DUPLICATE_KEY");
      expect(
        codes(withDefinition((d) => { d.rules.push({ ...d.rules[0], ruleKey: "synth-rule-2", inputs: [] }); })),
      ).toContain("SEED_DUPLICATE_KEY");
    });

    // The whole set of stored columns, so a column added to a row type later
    // cannot pass unchecked.
    const rowsOf: [string, (d: StoredSchemeDefinition) => Record<string, unknown>][] = [
      ["version", (d) => d.version as unknown as Record<string, unknown>],
      ["source", (d) => d.sources[0] as unknown as Record<string, unknown>],
      ["rule", (d) => d.rules[0] as unknown as Record<string, unknown>],
      ["input", (d) => input(d) as unknown as Record<string, unknown>],
    ];
    const columnsOf = rowsOf.flatMap(([label, select]) =>
      Object.keys(select(definition())).map((field) => [label, field, select] as const),
    );
    const rejected = ["SEED_ROW_FIELD_INVALID", "SEED_DEFINITION_MALFORMED"];

    it.each(columnsOf)("rejects a %s row with %s missing", (_label, field, select) => {
      const found = codes(withDefinition((d) => { delete select(d)[field]; }));
      expect(found.some((code) => rejected.includes(code))).toBe(true);
    });

    it.each(columnsOf)("rejects a %s row with %s of the wrong type", (_label, field, select) => {
      const found = codes(withDefinition((d) => { select(d)[field] = 12.5; }));
      expect(found.some((code) => rejected.includes(code))).toBe(true);
    });

    it.each(rowsOf)("rejects a %s row with a column that does not exist", (_label, select) => {
      expect(codes(withDefinition((d) => { select(d).synthExtra = null; }))).toContain("SEED_ROW_FIELD_INVALID");
    });

    it("accepts optional stored values at their valid edges", () => {
      expect(
        withDefinition((d) => {
          d.version.effectiveFrom = "2031-01-01";
          d.version.effectiveTo = "2031-01-01";
          d.version.applicationOpen = "2031-01-01T00:00:00Z";
          d.version.applicationClose = "2031-01-01T00:00:00.000Z";
          d.version.lateApplicationClose = "2031-01-02T00:00:00Z";
          d.version.enterpriseRelevance = ["SYNTH-enterprise"];
          d.sources[0].lastVerifiedAt = "2031-01-16T00:00:00Z";
          d.rules[0].effectiveFrom = "2031-01-01T00:00:00Z";
          d.rules[0].effectiveTo = "2031-01-01T00:00:00Z";
          input(d).priority = 0;
          input(d).routeKey = "synth-route";
        }),
      ).toEqual([]);
    });
  });

  it("rejects a rule citing a different source from its row", () => {
    const pack = sealPack({
      sourcePack: sourcePack({
        sources: [source(), source({ sourceId: "SYNTH-SOURCE-2", authorityTier: 3, storedAuthorityTier: "authoritative_secondary" })],
      }),
    });
    const value = definition();
    value.sources.push({ ...value.sources[0], id: SOURCE_ROW_ID_2, sourceKey: "SYNTH-SOURCE-2", authorityTier: "authoritative_secondary" });
    value.rules[0].sourceId = SOURCE_ROW_ID_2;
    expect(
      codes(validateSchemeSeedPacket(sealPacket({ definition: value }, pack), pack, sha256)),
    ).toContain("SEED_RULE_SOURCE_MISMATCH");
  });

  it("rejects a packet naming another content pack", () => {
    expect(
      codes(validateSchemeSeedPacket(sealPacket({ contentPackFingerprintSha256: "b".repeat(64) }), sealPack(), sha256)),
    ).toContain("SEED_CONTENT_PACK_MISMATCH");
  });

  it("rejects a packet for another version", () => {
    expect(
      codes(validateSchemeSeedPacket(sealPacket({ pin: OTHER_YEAR_PIN }), sealPack(), sha256)),
    ).toContain("SEED_OTHER_VERSION");
  });

  it("stops at an invalid content pack", () => {
    const pack = { ...sealPack(), contentFingerprintSha256: "b".repeat(64) };
    expect(codes(validateSchemeSeedPacket(sealPacket(), pack, sha256))).toEqual(["SEED_CONTENT_PACK_INVALID"]);
  });

  it("rejects missing coverage and a row left uncovered", () => {
    expect(codes(validateSchemeSeedPacket(sealPacket({ coverage: [] }), sealPack(), sha256))).toContain("COVERAGE_ROW_MISSING");
    const packet = { ...sealPacket(), coverage: undefined };
    expect(codes(validateSchemeSeedPacket(packet, sealPack(), sha256))).toContain("MALFORMED");
  });

  it("detects a row changed after the packet was sealed", () => {
    const packet = sealPacket();
    packet.definition.rules[0].description = "SYNTH altered";
    expect(codes(validateSchemeSeedPacket(packet, sealPack(), sha256))).toEqual(["SEED_PACKET_FINGERPRINT_MISMATCH"]);
  });

  it.each<[string, SchemeSeedPacket["priorStoredVersion"], string[]]>([
    ["a new version with listed differences", { rulesVersion: "synth-2031-v0", differences: ["SYNTH difference"] }, []],
    ["rewriting the same version", { rulesVersion: PIN.rulesVersion, differences: ["SYNTH difference"] }, ["SEED_PRIOR_VERSION_INVALID"]],
    ["no listed differences", { rulesVersion: "synth-2031-v0", differences: [] }, ["SEED_PRIOR_VERSION_INVALID"]],
  ])("handles a prior stored version with %s", (_label, priorStoredVersion, expected) => {
    expect(codes(validateSchemeSeedPacket(sealPacket({ priorStoredVersion }), sealPack(), sha256))).toEqual(expected);
  });

  it("assert throws on an invalid packet and passes a valid one", () => {
    const pack = sealPack();
    expect(() => assertSchemeSeedPacket(sealPacket({}, pack), pack, sha256)).not.toThrow();
    expect(() => assertSchemeSeedPacket(sealPacket({ pin: OTHER_YEAR_PIN }, pack), pack, sha256))
      .toThrow("INVALID_SCHEME_SEED_PACKET:SEED_OTHER_VERSION");
  });
});

describe("malformed diagnostics", () => {
  // String() and template literals throw on this value; JSON can carry it.
  const unprintable = () => JSON.parse('{"toString":null}') as never;
  const claim = (coveredSourceIds: unknown[]) => ({
    status: "CLAIMED" as const,
    coveredSourceIds: coveredSourceIds as string[],
    reviewRecord: REVIEW,
  });
  const unsealedPack = (pack: SchemeSourcePack) => ({ ...sealPack(), sourcePack: pack });

  describe("an unprintable covered source id", () => {
    const pack = sourcePack({ completeness: claim([unprintable()]) });

    it("is reported by the source pack validator", () => {
      const unresolved = validateSchemeSourcePack(pack).find(
        (issue) => issue.code === "COMPLETENESS_SOURCE_UNRESOLVED",
      );
      expect(unresolved).toBeDefined();
      expect(unresolved?.sourceId).toBeUndefined();
    });

    it("is reported by the content pack validator", () => {
      expect(codes(validateSchemeContentPack(unsealedPack(pack), sha256))).toContain(
        "COMPLETENESS_SOURCE_UNRESOLVED",
      );
    });

    it("is reported by the seed packet validator", () => {
      const issues = validateSchemeSeedPacket(sealPacket(), unsealedPack(pack), sha256);
      expect(codes(issues)).toEqual(["SEED_CONTENT_PACK_INVALID"]);
      expect(issues[0].detail).toContain("COMPLETENESS_SOURCE_UNRESOLVED");
    });
  });

  it("reports a covered id only when it is text, even if a source shares the value", () => {
    const shared = unprintable();
    const issues = validateSchemeSourcePack(
      sourcePack({
        sources: [source({ sourceId: shared, contentScope: "EXTRACT" })],
        completeness: claim([shared]),
      }),
    );
    expect(codes(issues)).toEqual(
      expect.arrayContaining(["SOURCE_ID_INVALID", "COMPLETENESS_SOURCE_UNRESOLVED"]),
    );
  });

  it("reports an uncovered authoritative source with an unprintable id", () => {
    const uncovered = validateSchemeSourcePack(
      sourcePack({ sources: [source(), source({ sourceId: unprintable() })] }),
    ).find((issue) => issue.code === "COMPLETENESS_AUTHORITATIVE_SOURCE_NOT_COVERED");
    expect(uncovered).toBeDefined();
    expect(uncovered?.sourceId).toBeUndefined();
  });

  it("reports an unprintable stored owner rather than formatting it", () => {
    const value = definition();
    value.rules[0].inputs[0].owner = unprintable();
    expect(
      codes(validateSchemeSeedPacket({ ...sealPacket(), definition: value }, sealPack(), sha256)),
    ).toContain("SEED_ROW_FIELD_INVALID");
  });

  it.each([undefined, null, "BOGUS", "toString"])(
    "rejects malformed frozen-row status %s without throwing",
    (status) => {
      const frozen = { ...row(), status } as unknown as RequirementRegisterRow;
      let issues: { code: string }[] = [];
      expect(() => {
        issues = validateRegisterCoverage(sealPacket().coverage, [frozen]);
      }).not.toThrow();
      expect(codes(issues)).toContain("MALFORMED");
    },
  );

  it("fails closed at every exported validator boundary when property access throws", () => {
    const hostile = new Proxy({}, {
      get() { throw new Error("hostile get"); },
      ownKeys() { throw new Error("hostile ownKeys"); },
      getOwnPropertyDescriptor() { throw new Error("hostile descriptor"); },
    });
    const cases: [string, () => { code: string }[], string][] = [
      ["source pack", () => validateSchemeSourcePack(hostile), "MALFORMED"],
      ["register", () => validateRequirementRegister(hostile, sourcePack()), "MALFORMED"],
      ["content pack", () => validateSchemeContentPack(hostile, sha256), "MALFORMED"],
      ["coverage input", () => validateRegisterCoverage(hostile, [row()]), "MALFORMED"],
      ["coverage rows", () => validateRegisterCoverage([], [hostile as RequirementRegisterRow]), "MALFORMED"],
      ["seed packet", () => validateSchemeSeedPacket(hostile, sealPack(), sha256), "MALFORMED"],
      ["seed content pack", () => validateSchemeSeedPacket(sealPacket(), hostile, sha256), "SEED_CONTENT_PACK_INVALID"],
    ];

    for (const [label, run, expectedCode] of cases) {
      let issues: { code: string }[] = [];
      expect(() => { issues = run(); }, label).not.toThrow();
      expect(codes(issues), label).toContain(expectedCode);
    }
  });

  // Every position in every validator's input, against every malformed shape.
  const MALFORMED_VALUES = ['{"toString":null}', '{"toString":null,"valueOf":null}', "[]", "12.5", "null", "true"];

  function pathsOf(value: unknown, path: (string | number)[] = []): (string | number)[][] {
    if (Array.isArray(value)) {
      return [path, ...value.flatMap((item, index) => pathsOf(item, [...path, index]))];
    }
    if (value !== null && typeof value === "object") {
      return [path, ...Object.entries(value).flatMap(([key, item]) => pathsOf(item, [...path, key]))];
    }
    return [path];
  }

  function replacedAt<T>(value: T, path: (string | number)[], replacement: unknown): T {
    const clone = JSON.parse(JSON.stringify(value)) as T;
    let parent = clone as Record<string | number, unknown>;
    path.slice(0, -1).forEach((key) => { parent = parent[key] as typeof parent; });
    parent[path[path.length - 1]] = replacement;
    return clone;
  }

  const validators: [string, unknown, (input: unknown) => { code: string }[]][] = [
    ["source pack", sourcePack(), validateSchemeSourcePack],
    ["register", { pin: PIN, rows: [row()] }, (input) => validateRequirementRegister(input, sourcePack())],
    ["content pack", sealPack(), (input) => validateSchemeContentPack(input, sha256)],
    ["seed packet", sealPacket(), (input) => validateSchemeSeedPacket(input, sealPack(), sha256)],
    ["content pack of a seed packet", sealPack(), (input) => validateSchemeSeedPacket(sealPacket(), input, sha256)],
  ];

  it.each(validators)("the %s validator reports every malformed position as text", (_label, valid, validate) => {
    expect(validate(valid)).toEqual([]);

    for (const path of pathsOf(valid).filter((candidate) => candidate.length > 0)) {
      for (const malformed of MALFORMED_VALUES) {
        const position = `${path.join(".")} = ${malformed}`;
        let issues: Record<string, unknown>[] = [];
        expect(() => {
          issues = validate(replacedAt(valid, path, JSON.parse(malformed))) as typeof issues;
        }, position).not.toThrow();

        for (const issue of issues) {
          expect(typeof issue.detail, position).toBe("string");
          for (const context of ["rowId", "sourceId", "dataKey", "ruleKey"]) {
            expect(["string", "undefined"], `${position} ${context}`).toContain(typeof issue[context]);
          }
        }
      }
    }
  });

  describe("sparse arrays", () => {
    const sparseForms = (items: unknown[]): [string, unknown[]][] => {
      const leading = new Array<unknown>(items.length + 1);
      items.forEach((item, index) => { leading[index + 1] = item; });
      const trailing = [...items];
      trailing.length += 1;
      return [
        ["only a hole", new Array<unknown>(1)],
        ["a leading hole", leading],
        ["a trailing hole", trailing],
      ];
    };

    const withDefinition = (set: (value: StoredSchemeDefinition) => void) => {
      const value = definition();
      set(value);
      return validateSchemeSeedPacket({ ...sealPacket(), definition: value }, sealPack(), sha256);
    };

    it.each(sparseForms(definition().sources))("rejects stored sources with %s", (_label, sparse) => {
      expect(
        codes(withDefinition((value) => { value.sources = sparse as StoredSchemeDefinition["sources"]; })),
      ).toContain("SEED_DEFINITION_MALFORMED");
    });

    it.each(sparseForms(definition().rules))("rejects stored rules with %s", (_label, sparse) => {
      expect(
        codes(withDefinition((value) => { value.rules = sparse as StoredSchemeDefinition["rules"]; })),
      ).toContain("SEED_DEFINITION_MALFORMED");
    });

    it.each(sparseForms(definition().rules[0].inputs))("rejects stored rule inputs with %s", (_label, sparse) => {
      expect(
        codes(withDefinition((value) => {
          value.rules[0].inputs = sparse as StoredSchemeDefinition["rules"][number]["inputs"];
        })),
      ).toContain("SEED_DEFINITION_MALFORMED");
    });

    it.each(sparseForms(["SYNTH difference"]))("rejects prior version differences with %s", (_label, sparse) => {
      const packet = {
        ...sealPacket(),
        priorStoredVersion: { rulesVersion: "synth-prior", differences: sparse },
      };
      expect(codes(validateSchemeSeedPacket(packet, sealPack(), sha256))).toContain("SEED_PRIOR_VERSION_INVALID");
    });

    it.each(sparseForms(["dairy"]))("rejects stored enterprise relevance with %s", (_label, sparse) => {
      expect(
        codes(withDefinition((value) => { value.version.enterpriseRelevance = sparse as string[]; })),
      ).toContain("SEED_ROW_FIELD_INVALID");
    });

    it.each(sparseForms([row()]))("rejects frozen coverage rows with %s", (_label, sparse) => {
      expect(codes(validateRegisterCoverage([], sparse as RequirementRegisterRow[]))).toEqual(["MALFORMED"]);
    });

    it.each(sparseForms([{ key: "synth.fact", owner: "farm_profile" }]))(
      "rejects a frozen coverage row's data keys with %s",
      (_label, sparse) => {
        const frozen = row({ dataKeys: sparse as RequirementRegisterRow["dataKeys"] });
        expect(codes(validateRegisterCoverage([], [frozen]))).toEqual(["MALFORMED"]);
      },
    );

    // A hole must be found by a check of its own, not only by the fingerprint
    // that any change to a sealed input would break.
    const contentCodes = (issues: { code: string }[]) =>
      codes(issues).filter((code) => !code.includes("FINGERPRINT"));

    function valueAt(value: unknown, path: (string | number)[]): unknown {
      return path.reduce<unknown>((parent, key) => (parent as Record<string | number, unknown>)[key], value);
    }

    it.each(validators.slice(0, 4))("the %s validator rejects a hole in every array", (_label, valid, validate) => {
      const arrayPaths = pathsOf(valid).filter(
        (path) => path.length > 0 && Array.isArray(valueAt(valid, path)),
      );
      expect(arrayPaths.length).toBeGreaterThan(0);

      for (const path of arrayPaths) {
        for (const [form, sparse] of sparseForms(valueAt(valid, path) as unknown[])) {
          const position = `${path.join(".")} with ${form}`;
          let issues: { code: string }[] = [];
          expect(() => {
            issues = validate(replacedAt(valid, path, sparse));
          }, position).not.toThrow();
          expect(contentCodes(issues), position).not.toEqual([]);
        }
      }
    });
  });
});

describe("seed packet document", () => {
  const fence = "```";

  it("round-trips a packet from one fenced json block", () => {
    const pack = sealPack();
    const packet = sealPacket({}, pack);
    const markdown = `# SYNTH\n\nProse.\n\n${fence}json\n${JSON.stringify(packet, null, 2)}\n${fence}\n`;
    const parsed = parseSeedPacketDocument(markdown);
    expect(parsed.issues).toEqual([]);
    expect(validateSchemeSeedPacket(parsed.packet, pack, sha256)).toEqual([]);
  });

  it.each([
    ["no block", "# SYNTH\n"],
    ["two blocks", `${fence}json\n{}\n${fence}\n\n${fence}json\n{}\n${fence}\n`],
    ["invalid JSON", `${fence}json\n{nope\n${fence}\n`],
  ])("rejects %s", (_label, markdown) => {
    expect(parseSeedPacketDocument(markdown)).toEqual({
      packet: null,
      issues: [expect.objectContaining({ code: "SEED_DOCUMENT_INVALID" })],
    });
  });
});
