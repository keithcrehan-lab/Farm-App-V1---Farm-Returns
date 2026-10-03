/**
 * Campaign C science freeze — reference-case consistency checks.
 *
 * Validates the frozen DRAFT reference cases in
 * `docs/farm-return-next/campaign-c/reference-cases.slurry-agronomy-ie-2026-v1.json`
 * against their own evidence values and the claim/conflict registers. This
 * is not a recommendation engine and no production code reads the file:
 * it checks that every documented number is internally consistent and that
 * the values Farm Return already ships agree with the frozen claims.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  kSilageKgHa,
  NUTRIENT_ENGINE_VERSION,
  nSilageKgHa,
  pBuildUpKgHa,
  pMaintenanceSilageKgHa,
  resolveAvailableSlurryNutrients,
  slurryAvailableSpringLessKgHa,
  slurryAvailableSummerLessKgHa,
} from "./nutrients";
import { classifySlurryTiming } from "./slurry-timing";
import { tracked } from "./types";

type Nutrient = "n" | "p" | "k";
type Npk = Record<Nutrient, number>;

interface Reading {
  id: string;
  availableOverride?: string;
  proposedRateM3Ha?: number;
  limits: { nutrient: Nutrient; kgHa: number }[];
  rateM3Ha: number;
  supplyKgHa: Npk;
  balanceKgHa: Npk;
}

interface ReferenceCase {
  id: string;
  inputOverrides: Record<string, unknown>;
  claims: string[];
  availablePerM3: Npk | null;
  alternativeAvailablePerM3?: Npk & { claim: string };
  requirementKgHa: Npk | null;
  priorCreditKgHa: Npk | null;
  remainingRequirementKgHa: Npk | null;
  readings: Reading[];
  expectedStatus: string;
  blockingItems: string[];
  statusOnceOpenItemsClosed?: string;
  reasonCodes: string[];
  rateM3Ha: number | null;
  rateM3HaIsCandidate?: boolean;
  totalVolume: { status: string; m3: number | null; spreadableAreaHa?: number };
}

interface ReferenceSuite {
  ruleSetId: string;
  ruleSetStatus: string;
  campaignCBaseSha: string;
  statuses: string[];
  openItems: string[];
  readings: Record<string, string>;
  evidenceValues: {
    springLessAvailablePerM3Index34: ({ dmPct: number } & Npk)[];
    lowIndexAvailabilityFactor: { p: number; k: number; appliesAtIndex: number[] };
    firstCutRequirementKgHaAt5tDm: {
      n: { notGrazedPreviousYear: number; grazedPreviousYear: number };
      p: Record<string, number>;
      k: Record<string, number>;
    };
  };
  baseline: Record<string, unknown>;
  cases: ReferenceCase[];
}

const dir = path.resolve(__dirname, "../../docs/farm-return-next/campaign-c");
const suite = JSON.parse(readFileSync(path.join(dir, "reference-cases.slurry-agronomy-ie-2026-v1.json"), "utf8")) as ReferenceSuite;
const claimsDoc = readFileSync(path.join(dir, "SOURCES_AND_CLAIMS.md"), "utf8");
const conflictsDoc = readFileSync(path.join(dir, "CONFLICTS.md"), "utf8");

const NUTRIENTS: Nutrient[] = ["n", "p", "k"];
const milli = (x: number) => Math.round(x * 1000);
const input = (c: ReferenceCase, key: string) => (key in c.inputOverrides ? c.inputOverrides[key] : suite.baseline[key]);

/** Rate in tenths of m³/ha, floored (the documented rounding rule), in integer milli-units so no float drift decides a boundary. */
function flooredRateTenths(limits: Reading["limits"], available: Npk): number {
  return Math.min(...limits.map((l) => Math.floor((milli(l.kgHa) * 10) / milli(available[l.nutrient]))));
}

describe("Campaign C reference cases — suite identity", () => {
  it("is the DRAFT slurry-agronomy-ie-2026-v1 rule set pinned to the Campaign C base", () => {
    expect(suite.ruleSetId).toBe("slurry-agronomy-ie-2026-v1");
    expect(suite.ruleSetStatus).toBe("DRAFT");
    expect(suite.campaignCBaseSha).toBe("29f787a8b9bc1a30613dc621e221ad79651c315f");
  });

  it("contains every required case CC-001..CC-018", () => {
    const ids = new Set(suite.cases.map((c) => c.id));
    for (let i = 1; i <= 18; i++) expect(ids.has(`CC-${String(i).padStart(3, "0")}`)).toBe(true);
    expect(ids.size).toBe(suite.cases.length);
  });
});

describe("Campaign C reference cases — traceability and status discipline", () => {
  it.each(suite.cases.map((c) => [c.id, c] as const))("%s cites only registered claims, conflicts and statuses", (_id, c) => {
    for (const claim of c.claims) expect(claimsDoc).toContain(`\`${claim}\``);
    for (const item of c.blockingItems) {
      expect(suite.openItems).toContain(item);
      expect(conflictsDoc).toContain(`### ${item}`);
    }
    expect(suite.statuses).toContain(c.expectedStatus);
    expect(suite.statuses).toContain(c.totalVolume.status);
    if (c.statusOnceOpenItemsClosed !== undefined) expect(suite.statuses).toContain(c.statusOnceOpenItemsClosed);
    for (const r of c.readings) expect(Object.keys(suite.readings)).toContain(r.id);
  });

  it.each(suite.cases.map((c) => [c.id, c] as const))("%s never presents a final rate or volume while blocked", (_id, c) => {
    const blocked = ["UNKNOWN_REQUIRED_DATA", "EVIDENCE_CONFLICT", "OUT_OF_SCOPE", "NOT_RECOMMENDED_AGRONOMIC"].includes(c.expectedStatus);
    if (blocked) expect(c.rateM3Ha).toBeNull();
    if (c.rateM3Ha !== null) expect(c.rateM3HaIsCandidate).toBe(true); // DRAFT: no rate is final
    if (c.totalVolume.m3 !== null) expect(c.rateM3Ha).not.toBeNull();
    if (c.expectedStatus === "EVIDENCE_CONFLICT") expect(c.blockingItems.some((i) => i.startsWith("CONF-"))).toBe(true);
  });

  it("unknown inputs stay unknown: no zero-filled prior credit or availability", () => {
    const unknownPrior = suite.cases.find((c) => c.id === "CC-008")!;
    expect(unknownPrior.priorCreditKgHa).toBeNull();
    expect(unknownPrior.remainingRequirementKgHa).toBeNull();
    const unknownDm = suite.cases.find((c) => c.id === "CC-009")!;
    expect(unknownDm.availablePerM3).toBeNull();
    const unknownArea = suite.cases.find((c) => c.id === "CC-015")!;
    expect(unknownArea.rateM3Ha).not.toBeNull();
    expect(unknownArea.totalVolume).toMatchObject({ status: "UNKNOWN_REQUIRED_DATA", m3: null });
  });
});

describe("Campaign C reference cases — arithmetic", () => {
  const ev = suite.evidenceValues;

  it.each(suite.cases.filter((c) => c.availablePerM3 !== null).map((c) => [c.id, c] as const))(
    "%s available nutrients follow the evidenced DM row and low-index factors",
    (_id, c) => {
      const dm = input(c, "slurryDmPct") as number;
      const row = ev.springLessAvailablePerM3Index34.find((r) => r.dmPct === dm)!;
      expect(row).toBeDefined();
      const pIndex = input(c, "pIndex") as number;
      const kIndex = input(c, "kIndex") as number;
      const low = ev.lowIndexAvailabilityFactor;
      expect(c.availablePerM3!.n).toBeCloseTo(row.n, 9);
      expect(c.availablePerM3!.p).toBeCloseTo(low.appliesAtIndex.includes(pIndex) ? row.p * low.p : row.p, 9);
      expect(c.availablePerM3!.k).toBeCloseTo(low.appliesAtIndex.includes(kIndex) ? row.k * low.k : row.k, 9);
    },
  );

  it.each(suite.cases.filter((c) => c.requirementKgHa !== null).map((c) => [c.id, c] as const))(
    "%s gross requirement follows the first-cut tables and remaining = gross − prior credit",
    (_id, c) => {
      const req = ev.firstCutRequirementKgHaAt5tDm;
      const kIndex = input(c, "kIndex") as number;
      const sampledThisSeason = input(c, "soilSampleYearIsCurrentSeason") as boolean;
      expect(c.requirementKgHa!.n).toBe(input(c, "grazedPreviousYear") ? req.n.grazedPreviousYear : req.n.notGrazedPreviousYear);
      expect(c.requirementKgHa!.p).toBe(req.p[String(input(c, "pIndex"))]);
      expect(c.requirementKgHa!.k).toBe(kIndex === 4 && !sampledThisSeason ? req.k.kIndex4NotYearOfSampling : req.k[String(kIndex)]);
      if (c.priorCreditKgHa !== null && c.remainingRequirementKgHa !== null) {
        for (const n of NUTRIENTS) expect(c.remainingRequirementKgHa[n]).toBeCloseTo(c.requirementKgHa![n] - c.priorCreditKgHa[n], 9);
      }
    },
  );

  const withReadings = suite.cases.flatMap((c) => c.readings.map((r, i) => [`${c.id} reading ${r.id}#${i}`, c, r] as const));

  it.each(withReadings)("%s: rate, supply and signed balance are consistent", (_label, c, r) => {
    const available = (r.availableOverride ? (c as unknown as Record<string, Npk>)[r.availableOverride] : c.availablePerM3)!;
    const expectedTenths = r.proposedRateM3Ha !== undefined ? Math.round(r.proposedRateM3Ha * 10) : flooredRateTenths(r.limits, available);
    expect(Math.round(r.rateM3Ha * 10)).toBe(expectedTenths);
    for (const n of NUTRIENTS) {
      expect(r.supplyKgHa[n]).toBeCloseTo(r.rateM3Ha * available[n], 9);
      // Oversupply is a negative balance, never floored away.
      expect(r.balanceKgHa[n]).toBeCloseTo(c.remainingRequirementKgHa![n] - r.supplyKgHa[n], 9);
    }
  });

  it("candidate total volume uses the recorded spreadable area, never gross area", () => {
    const c = suite.cases.find((x) => x.id === "CC-015B")!;
    expect(c.totalVolume.spreadableAreaHa).toBe(input(c, "spreadableAreaHa"));
    expect(Math.round(c.totalVolume.m3! * 10)).toBe(Math.floor(milli(c.rateM3Ha!) * milli(c.totalVolume.spreadableAreaHa!) / 100000));
  });
});

describe("Campaign C claims vs values Farm Return already ships", () => {
  it("spring LESS rows (Index 3/4 basis) match slurryAvailableSpringLessKgHa", () => {
    for (const row of suite.evidenceValues.springLessAvailablePerM3Index34) {
      const out = slurryAvailableSpringLessKgHa(1, row.dmPct);
      expect(out.status).toBe("OK");
      if (out.status !== "OK") continue;
      for (const n of NUTRIENTS) expect(out.value[n]).toBeCloseTo(row[n], 9);
    }
  });

  it("first-cut N/P/K requirements at 5 t DM/ha match the Green Book functions", () => {
    const req = suite.evidenceValues.firstCutRequirementKgHaAt5tDm;
    expect(nSilageKgHa(1, false)).toBe(req.n.notGrazedPreviousYear);
    expect(nSilageKgHa(1, true)).toBe(req.n.grazedPreviousYear);
    for (const index of [1, 2, 3, 4] as const) {
      expect(pBuildUpKgHa(index) + pMaintenanceSilageKgHa(1, index, 5)).toBe(req.p[String(index)]);
      expect(kSilageKgHa(1, index, 5)).toBe(req.k[String(index)]);
    }
  });
});

describe("Campaign C CC-B1 adjudication record", () => {
  const adjudication = readFileSync(path.join(dir, "ADJUDICATION_CC-B1.md"), "utf8");
  const OUTCOMES = ["RESOLVED", "RESOLVED_WITH_SCOPE", "UNRESOLVED_CONFLICT", "INSUFFICIENT_EVIDENCE", "OUT_OF_SCOPE"];
  const summaryRow = (item: string) => adjudication.split("\n").find((l) => l.startsWith(`| ${item} |`));
  const classification = (item: string) => summaryRow(item)!.split("|")[3].replace(/\*/g, "").trim();

  it.each(suite.openItems)("%s has exactly one CC-B1 classification in the summary table", (item) => {
    expect(summaryRow(item)).toBeDefined();
    expect(OUTCOMES).toContain(classification(item));
  });

  it("unresolved core items keep the rule set DRAFT and stay open in the reference cases", () => {
    for (const core of ["CONF-02", "CONF-03", "GAP-01"]) {
      expect(classification(core).startsWith("RESOLVED")).toBe(false);
      expect(suite.openItems).toContain(core);
    }
    expect(suite.ruleSetStatus).toBe("DRAFT");
  });

  it("every claim cited by the adjudication is registered", () => {
    const cited = new Set(adjudication.match(/`CLM-[A-Z0-9-]+`/g) ?? []);
    expect(cited.size).toBeGreaterThan(0);
    for (const claim of cited) expect(claimsDoc).toContain(claim);
  });
});

describe("Campaign C AI adjudication 2026-09-29 — evidence gate", () => {
  const record = readFileSync(path.join(dir, "AI_ADJUDICATION_2026-09-29.md"), "utf8");
  const ITEMS = ["CONF-01", "CONF-02", "CONF-03", "CONF-04", ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `GAP-0${i}`)];
  const SCIENTIFIC = ["RESOLVED", "RESOLVED_WITH_SCOPE", "PROVISIONALLY_RESOLVED"];
  /** Summary-table cells: scientific, evidence class, implementation evidence, implementation status. */
  const cells = (item: string) => {
    const row = record.split("\n").find((l) => l.startsWith(`| ${item} |`) && l.split("|").length === 7);
    expect(row, item).toBeDefined();
    return row!.split("|").slice(2, -1).map((c) => c.trim());
  };

  it.each(ITEMS)("%s has a scientific classification, evidence class and implementation status", (item) => {
    const [scientific, evidenceClass, implementationEvidence, implementation] = cells(item);
    expect(SCIENTIFIC).toContain(scientific);
    expect(evidenceClass).toMatch(/SOURCE_DIRECT|SOURCE_DERIVED|AI_PROVISIONAL/);
    expect(implementationEvidence).toMatch(/REPOSITORY_VERIFIED|AI_REVIEW_ONLY|Policy only/);
    expect(implementation).toMatch(/ALREADY_IMPLEMENTED|READY_FOR_IMPLEMENTATION_REVIEW|IMPLEMENTATION_DEFERRED_|NOT_APPLICABLE/);
  });

  it("no rule is newly IMPLEMENTED, and every AI_REVIEW_ONLY component is deferred", () => {
    for (const item of ITEMS) {
      const [, , implementationEvidence, implementation] = cells(item);
      expect(implementation).not.toMatch(/(^|[^_])IMPLEMENTED\b/);
      if (implementationEvidence.includes("AI_REVIEW_ONLY")) expect(implementation).toContain("DEFERRED");
    }
  });

  it("the rate selector stays AI_PROVISIONAL and nothing claims expert approval", () => {
    expect(claimsDoc).toMatch(/`CLM-AIR-GAP01-SELECTOR` \| [^|]*AI_PROVISIONAL_RATE_SELECTOR_V1[^|]*\| AI_PROVISIONAL/);
    expect(record).toContain("EXPERT_VALIDATION_PENDING");
    expect(record).toContain("EXTERNAL_RETRIEVAL_PERFORMED_BY_AUTHORISED_AI_REVIEW");
    expect(record).not.toMatch(/HUMAN_VALIDATED|EXPERT_APPROVED/);
    expect(suite.ruleSetStatus).toBe("DRAFT");
  });

  it("every claim cited by the AI adjudication is registered", () => {
    const cited = new Set(record.match(/`CLM-[A-Z0-9-]+`/g) ?? []);
    expect(cited.size).toBeGreaterThanOrEqual(ITEMS.length);
    for (const claim of cited) expect(claimsDoc).toContain(`| ${claim} |`);
  });
});

describe("Campaign C AI adjudication 2026-09-29 — production regressions (no semantics change)", () => {
  const spring = (pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4, rate = 1, dmPct = 6) =>
    resolveAvailableSlurryNutrients({
      allocation: {
        applicationMethod: tracked("LESS" as const, "farmer_adjusted", "test"),
        applicationDate: tracked("2027-03-15", "farmer_adjusted", "test"),
      },
      applicationRateM3ha: rate,
      dmPct,
      dmPctStatus: "verified",
      pIndex,
      kIndex,
    });

  it("engine version: v1.4.0 adds only the per-nutrient slurry credit view and per-nutrient gross/net requirement (per-nutrient P/K Increments 2 and 3); these cases' semantics are unchanged", () => {
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.5.0");
  });

  it("CONF-01: 6% spring LESS P stays 0.5 and 7% stays 0.6 kg/m3", () => {
    const six = slurryAvailableSpringLessKgHa(1, 6);
    const seven = slurryAvailableSpringLessKgHa(1, 7);
    expect(six.status === "OK" && six.value).toEqual({ n: 1.0, p: 0.5, k: 3.5 });
    expect(seven.status === "OK" && seven.value).toEqual({ n: 1.1, p: 0.6, k: 4.0 });
  });

  it("CONF-03: low-index availability factors stay P 50% / K 90%, applied per nutrient (GAP-04)", () => {
    const low = spring(1, 2);
    const mixed = spring(3, 1);
    const base = spring(3, 3);
    if (low.status !== "OK" || mixed.status !== "OK" || base.status !== "OK") throw new Error("expected OK");
    expect(low.value.n).toBeCloseTo(1.0, 9);
    expect(low.value.p).toBeCloseTo(0.25, 9);
    expect(low.value.k).toBeCloseTo(3.15, 9);
    expect(mixed.value.p).toBeCloseTo(0.5, 9);
    expect(mixed.value.k).toBeCloseTo(3.15, 9);
    expect(base.value).toMatchObject({ n: 1.0, p: 0.5, k: 3.5 });
  });

  it("CONF-02: slurry K content is never truncated at 90 kg/ha", () => {
    const out = spring(3, 3, 33);
    if (out.status !== "OK") throw new Error("expected OK");
    expect(out.value.k).toBeCloseTo(115.5, 9);
  });

  it.each([6.3, 6.5, 5])("GAP-02/GAP-06: DM %s% is not interpolated and fails closed", (dm) => {
    const direct = slurryAvailableSpringLessKgHa(1, dm);
    expect(direct.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (direct.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(direct.reasonCode).toBe("BLOCK_NO_INTERPOLATION");
    expect(spring(3, 3, 1, dm).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(slurryAvailableSummerLessKgHa(1, dm).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("CONF-04 deferred: production timing labels are unchanged (the exact February boundary is AI_REVIEW_ONLY)", () => {
    expect(classifySlurryTiming("2027-01-31")).toBe("SPRING");
    expect(classifySlurryTiming("2027-02-01")).toBe("SPRING");
    expect(classifySlurryTiming("2027-04-30")).toBe("SPRING");
    expect(classifySlurryTiming("2027-05-01")).toBe("SUMMER");
  });

  it("GAP-03: P ±4 and K ±25 kg per t DM yield scaling is unchanged; N has no yield term (verified N 25 is not implemented)", () => {
    expect(pMaintenanceSilageKgHa(1, 3, 6) - pMaintenanceSilageKgHa(1, 3, 5)).toBe(4);
    expect(kSilageKgHa(1, 3, 6) - kSilageKgHa(1, 3, 5)).toBe(25);
    expect(nSilageKgHa(1, false)).toBe(125);
  });
});

describe("Campaign C stored Teagasc evidence ingestion 2026-09-29", () => {
  const snapshotDir = path.resolve(__dirname, "../../docs/scientific-engine/v3/external_teagasc_2026-09-29");
  const manifest = readFileSync(path.join(snapshotDir, "SOURCE_MANIFEST.md"), "utf8");
  const ingestion = claimsDoc.slice(claimsDoc.indexOf("## 6. Stored Teagasc evidence ingestion"));
  const rows = (prefix: string) =>
    ingestion
      .split("\n")
      .filter((l) => l.startsWith(`| \`${prefix}`))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const unquote = (cell: string) => cell.replace(/`/g, "");
  /** Visible page text: tags stripped, the entities these snapshots use decoded, whitespace collapsed. */
  const pageText = (file: string) =>
    readFileSync(path.join(snapshotDir, "raw", file), "utf8")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#8211;/g, "–")
      .replace(/&#8217;/g, "’")
      .replace(/\s+/g, " ");
  /** Source rows: ID, organisation, title, page dates, URL, local path, retrieved, SHA-256. */
  const sources = rows("TGC-");
  const fileOf = (sourceId: string) => unquote(sources.find((s) => unquote(s[0]) === sourceId)![5]).split("/").pop()!;
  /** Claim rows: ID, source, locator, proposition, evidence class, evidence state, implementation status, limitations. */
  const claims = Object.fromEntries(rows("CLM-TGC-").map((r) => [unquote(r[0]), r]));
  /** Reviewed AI rows: ID, sources, search result, previous state, previous class, new state, new class, implementation. */
  const reviewed = Object.fromEntries(rows("CLM-AIR-").map((r) => [unquote(r[0]), r]));

  it("registers all five manifest sources with the manifest's SHA-256, which matches the stored bytes", () => {
    expect(sources.map((s) => unquote(s[0]))).toEqual([
      "TGC-OM-2026",
      "TGC-K90",
      "TGC-SLURRY-TIMING",
      "TGC-YIELD-SCALE",
      "TGC-RATE-PRINCIPLE",
    ]);
    for (const s of sources) {
      const file = unquote(s[5]).split("/").pop()!;
      const sha = unquote(s[7]);
      expect(manifest).toContain(`\`${file}\`: \`${sha}\``);
      expect(createHash("sha256").update(readFileSync(path.join(snapshotDir, "raw", file))).digest("hex")).toBe(sha);
      expect(s[6]).toContain("2026-09-29");
    }
  });

  it("every REPOSITORY_VERIFIED ingested claim quotes wording present in its stored source", () => {
    expect(Object.keys(claims).length).toBeGreaterThanOrEqual(10);
    for (const [id, [, source, locator, , evidenceClass, evidenceState, status]] of Object.entries(claims)) {
      expect(["SOURCE_DIRECT", "SOURCE_DERIVED"], id).toContain(evidenceClass);
      expect(evidenceState, id).toBe("REPOSITORY_VERIFIED");
      expect(status, id).toMatch(/ALREADY_IMPLEMENTED|READY_FOR_IMPLEMENTATION_REVIEW|IMPLEMENTATION_DEFERRED_|NOT_APPLICABLE/);
      expect(status, id).not.toMatch(/(^|[^_])IMPLEMENTED\b/);
      const quotes = locator.match(/"[^"]+"/g) ?? [];
      expect(quotes.length, id).toBeGreaterThan(0);
      const text = pageText(fileOf(unquote(source)));
      for (const q of quotes) expect(text, `${id} ${q}`).toContain(q.slice(1, -1));
    }
  });

  it("source-direct share caps are recorded separately from the availability factors", () => {
    expect(claims["CLM-TGC-OM-SHARE-P"][4]).toBe("SOURCE_DIRECT");
    expect(claims["CLM-TGC-OM-SHARE-K"][4]).toBe("SOURCE_DIRECT");
    expect(claims["CLM-TGC-OM-AVAIL"][2]).toContain("reduce slurry P availability by 50%");
    expect(claims["CLM-TGC-YIELD-SCALE"][2]).toContain("Apply 25kg N, 4kg P & 25kg K per tonne of grass dry matter");
  });

  it("AI interpretations the stored sources do not state stay AI_PROVISIONAL / AI_REVIEW_ONLY and deferred", () => {
    for (const id of ["CLM-AIR-GAP01-SELECTOR", "CLM-AIR-CONF02-RECON", "CLM-AIR-CONF04-SPRING", "CLM-AIR-CONF03-SHARE"]) {
      const [, , , , , newState, newClass, implementation] = reviewed[id];
      expect(newState, id).toContain("AI_REVIEW_ONLY");
      expect(newClass, id).toContain("AI_PROVISIONAL");
      expect(implementation, id).toContain("DEFERRED");
    }
  });

  it("the stored sources state neither an exact February boundary nor a min(P, K) selector", () => {
    const timing = pageText("slurry-timing.html");
    expect(timing).toContain("for example, February to April");
    expect(timing).not.toMatch(/1(st)? February|30(th)? April/);
    const rate = pageText("rate-selection-principle.html") + pageText("organic-manures.html");
    expect(rate).not.toMatch(/lower of|lesser of|minimum of the/i);
  });
});
