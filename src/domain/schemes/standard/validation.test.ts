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
      id: "SYNTH-VERSION-ID",
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
        id: "SYNTH-SOURCE-ROW",
        schemeVersionId: "SYNTH-VERSION-ID",
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
        id: "SYNTH-RULE-ROW",
        schemeVersionId: "SYNTH-VERSION-ID",
        sourceId: "SYNTH-SOURCE-ROW",
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
            ruleId: "SYNTH-RULE-ROW",
            schemeVersionId: "SYNTH-VERSION-ID",
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

  it("rejects an implemented entry whose row reads an unregistered key", () => {
    const proposed = [row({ dataKeys: [{ key: "schemes.synth.2031.fact", owner: "schemes" }] })];
    expect(codes(validateRegisterCoverage([implemented], proposed))).toContain("COVERAGE_DATA_KEY_UNREGISTERED");
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
    ["a source row of another version", (d) => { d.sources[0].schemeVersionId = "SYNTH-OTHER"; }, "SEED_ROW_OTHER_VERSION"],
    ["a rule of another version", (d) => { d.rules[0].schemeVersionId = "SYNTH-OTHER"; }, "SEED_ROW_OTHER_VERSION"],
    ["an input of another version", (d) => { d.rules[0].inputs[0].schemeVersionId = "SYNTH-OTHER"; }, "SEED_ROW_OTHER_VERSION"],
    ["a source differing from the pack", (d) => { d.sources[0].contentFingerprintSha256 = "b".repeat(64); }, "SEED_SOURCE_MISMATCH"],
    ["a retrieval date differing from the pack", (d) => { d.sources[0].retrievedAt = "2031-01-16T00:00:00.000Z"; }, "SEED_SOURCE_MISMATCH"],
    ["a source not in the pack", (d) => { d.sources[0].sourceKey = "SYNTH-NOT-IN-PACK"; }, "SEED_SOURCE_NOT_IN_PACK"],
    ["a pack source with no row", (d) => { d.sources = []; }, "SEED_SOURCE_MISSING"],
    ["a duplicate rule key", (d) => { d.rules.push({ ...d.rules[0], id: "SYNTH-RULE-2" }); }, "SEED_DUPLICATE_KEY"],
    ["a rule with no register row", (d) => { d.rules.push({ ...d.rules[0], id: "SYNTH-RULE-2", ruleKey: "synth-unregistered", inputs: [] }); }, "SEED_RULE_NOT_IN_REGISTER"],
    ["a cited rule the packet does not load", (d) => { d.rules[0].ruleKey = "synth-renamed"; }, "SEED_RULE_REFERENCE_UNRESOLVED"],
    ["a row's fact missing from its rule", (d) => { d.rules[0].inputs = []; }, "SEED_ROW_KEY_NOT_IN_RULE"],
    ["a rule reading a fact its row does not name", (d) => { d.rules[0].inputs.push({ ...d.rules[0].inputs[0], dataKey: "cattle.animal.date_of_birth" }); }, "SEED_RULE_INPUT_NOT_IN_REGISTER"],
    ["a rule whose source is unresolved (shared validator)", (d) => { d.rules[0].sourceId = "SYNTH-NOPE"; }, "SEED_DEFINITION_INVALID"],
    ["an unregistered rule input (shared validator)", (d) => { d.rules[0].inputs[0].dataKey = "random.freeform.answer"; }, "SEED_DEFINITION_INVALID"],
  ])("rejects %s", (_label, change, code) => {
    expect(codes(withDefinition(change))).toContain(code);
  });

  it("rejects a rule citing a different source from its row", () => {
    const pack = sealPack({
      sourcePack: sourcePack({
        sources: [source(), source({ sourceId: "SYNTH-SOURCE-2", authorityTier: 3, storedAuthorityTier: "authoritative_secondary" })],
      }),
    });
    const value = definition();
    value.sources.push({ ...value.sources[0], id: "SYNTH-SOURCE-ROW-2", sourceKey: "SYNTH-SOURCE-2", authorityTier: "authoritative_secondary" });
    value.rules[0].sourceId = "SYNTH-SOURCE-ROW-2";
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
