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
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kSilageKgHa, nSilageKgHa, pBuildUpKgHa, pMaintenanceSilageKgHa, slurryAvailableSpringLessKgHa } from "./nutrients";

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
