import { describe, expect, it } from "vitest";
import { resolvePrecedingYearGsr, validateNewPrecedingYearGsrInput, type PrecedingYearGsrRecord } from "./preceding-year-gsr";

const record = (overrides: Partial<PrecedingYearGsrRecord> = {}): PrecedingYearGsrRecord => ({
  id: "r1",
  referenceYear: "2025",
  gsrKgNHa: 140,
  status: "verified",
  source: "DAFM Nitrates Statement 2025",
  recordedAt: "2026-01-20T09:00:00.000Z",
  ...overrides,
});

describe("resolvePrecedingYearGsr — LESS_GSR_100 evidence", () => {
  it("uses only the record for the year before the application", () => {
    expect(resolvePrecedingYearGsr([record()], "2026-03-15")).toMatchObject({ status: "RESOLVED", referenceYear: "2025", gsrKgNHa: 140, recordId: "r1" });
    expect(resolvePrecedingYearGsr([record()], "2027-03-15")).toMatchObject({ status: "UNRESOLVED", referenceYear: "2026", reasonCode: "PRECEDING_YEAR_GSR_NOT_RECORDED" });
    expect(resolvePrecedingYearGsr([], "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_NOT_RECORDED" });
  });

  it("takes the latest record for the year, and treats disagreeing tied records as a conflict", () => {
    const later = record({ id: "r2", gsrKgNHa: 80, recordedAt: "2026-02-01T09:00:00.000Z" });
    expect(resolvePrecedingYearGsr([record(), later], "2026-03-15")).toMatchObject({ status: "RESOLVED", gsrKgNHa: 80, recordId: "r2" });
    const tied = record({ id: "r3", gsrKgNHa: 60 });
    expect(resolvePrecedingYearGsr([record(), tied], "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_CONFLICT" });
    expect(resolvePrecedingYearGsr([record(), record({ id: "r4" })], "2026-03-15")).toMatchObject({ status: "RESOLVED", gsrKgNHa: 140 });
  });

  it("never resolves an invalid record or application date", () => {
    expect(resolvePrecedingYearGsr([record({ gsrKgNHa: Number.NaN })], "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
    expect(resolvePrecedingYearGsr([record({ source: " " })], "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
    expect(resolvePrecedingYearGsr([record()], "2026-3-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "APPLICATION_DATE_INVALID" });
  });

  it("F003: two corrections in the same millisecond with different values — the later database order wins, never a false conflict", () => {
    // PostgreSQL microseconds .123100 and .123900 parse to the same JS millisecond.
    const first = record({ id: "b-first", gsrKgNHa: 120, recordedAt: "2026-11-03T10:00:00.123100+00:00", recordOrder: 7 });
    const second = record({ id: "a-second", gsrKgNHa: 95, recordedAt: "2026-11-03T10:00:00.123900+00:00", recordOrder: 8 });
    expect(Date.parse(first.recordedAt)).toBe(Date.parse(second.recordedAt));
    for (const records of [[first, second], [second, first]])
      expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({ status: "RESOLVED", gsrKgNHa: 95, recordId: "a-second", orderBasis: "DATABASE_RECORD_ORDER" });
    // Without a database order the legacy fallback keeps full timestamp
    // precision: .123900 is strictly later than .123100.
    const legacy = [first, second].map((r) => ({ ...r, recordOrder: undefined }));
    for (const records of [legacy, [...legacy].reverse()])
      expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({ status: "RESOLVED", gsrKgNHa: 95, recordId: "a-second", orderBasis: "LEGACY_RECORDED_AT" });
  });

  it("F003: same value, corrected provenance/status — the later database order's provenance wins, not the id tie-break", () => {
    const stale = record({ id: "a-stale", status: "farmer_adjusted", source: "Farmer estimate", recordedAt: "2026-11-03T10:00:00.123100+00:00", recordOrder: 3 });
    const corrected = record({ id: "z-corrected", status: "verified", source: "DAFM Nitrates Statement 2025", recordedAt: "2026-11-03T10:00:00.123900+00:00", recordOrder: 4 });
    expect(resolvePrecedingYearGsr([stale, corrected], "2026-03-15")).toMatchObject({
      status: "RESOLVED",
      gsrKgNHa: 140,
      evidenceStatus: "verified",
      source: "DAFM Nitrates Statement 2025",
      recordId: "z-corrected",
      orderBasis: "DATABASE_RECORD_ORDER",
    });
  });

  it("F003: a database-ordered record outranks every legacy record, whatever time the legacy record claims", () => {
    const tableRecord = record({ id: "t1", gsrKgNHa: 95, recordedAt: "2026-02-01T09:00:00.000Z", recordOrder: 1 });
    const legacyFuture = record({ id: "l1", gsrKgNHa: 60, recordedAt: "2099-01-01T00:00:00.000Z" });
    expect(resolvePrecedingYearGsr([legacyFuture, tableRecord], "2026-03-15")).toMatchObject({ gsrKgNHa: 95, recordId: "t1", orderBasis: "DATABASE_RECORD_ORDER" });
  });

  it("F003: legacy records without an order resolve deterministically by recorded time, and fail closed only when truly ambiguous", () => {
    const older = record({ id: "l-old", gsrKgNHa: 120, recordedAt: "2026-01-01T09:00:00.000Z" });
    const newer = record({ id: "l-new", gsrKgNHa: 90, recordedAt: "2026-01-02T09:00:00.000Z" });
    for (const records of [[older, newer], [newer, older]])
      expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({ gsrKgNHa: 90, recordId: "l-new", orderBasis: "LEGACY_RECORDED_AT" });
    const tiedSame = [record({ id: "l-b" }), record({ id: "l-a" })];
    expect(resolvePrecedingYearGsr(tiedSame, "2026-03-15")).toMatchObject({ status: "RESOLVED", recordId: "l-a" });
    const tiedDifferent = [record({ id: "l-b" }), record({ id: "l-a", gsrKgNHa: 60 })];
    expect(resolvePrecedingYearGsr(tiedDifferent, "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_CONFLICT" });
  });

  it("F003: a duplicated or malformed database order is not database evidence — fails closed", () => {
    const duplicate = [record({ id: "d1", recordOrder: 5 }), record({ id: "d2", recordOrder: 5, gsrKgNHa: 60 })];
    expect(resolvePrecedingYearGsr(duplicate, "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
    expect(resolvePrecedingYearGsr([record({ recordOrder: 1.5 })], "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
    expect(resolvePrecedingYearGsr([record({ recordOrder: Number.NaN })], "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
  });

  it("F003: legacy same-value provenance correction a fraction of a millisecond later — the newer provenance wins in either order", () => {
    // Same JS millisecond; the id tie-break would pick the stale "a-stale".
    const stale = record({ id: "a-stale", status: "farmer_adjusted", source: "Farmer estimate", recordedAt: "2026-11-03T10:00:00.123100+00:00" });
    const corrected = record({ id: "z-corrected", status: "verified", source: "DAFM Nitrates Statement 2025", recordedAt: "2026-11-03T10:00:00.123900+00:00" });
    expect(Date.parse(stale.recordedAt)).toBe(Date.parse(corrected.recordedAt));
    for (const records of [[stale, corrected], [corrected, stale]])
      expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({
        status: "RESOLVED",
        gsrKgNHa: 140,
        evidenceStatus: "verified",
        source: "DAFM Nitrates Statement 2025",
        recordId: "z-corrected",
        orderBasis: "LEGACY_RECORDED_AT",
      });
    // PostgreSQL text form (space separator, "+00" zone) compares the same way.
    const pgStale = { ...stale, recordedAt: "2026-11-03 10:00:00.1231+00" };
    const pgCorrected = { ...corrected, recordedAt: "2026-11-03 10:00:00.1239+00" };
    for (const records of [[pgStale, pgCorrected], [pgCorrected, pgStale]])
      expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({ status: "RESOLVED", recordId: "z-corrected" });
  });

  it("F003: legacy records at the genuinely same instant with the same value but different provenance — conflict, never an id tie-break", () => {
    const at = "2026-11-03T10:00:00.123100+00:00";
    const byStatus = [record({ id: "a", status: "farmer_adjusted", recordedAt: at }), record({ id: "b", status: "verified", recordedAt: at })];
    const bySource = [record({ id: "a", source: "Farmer estimate", recordedAt: at }), record({ id: "b", source: "DAFM Nitrates Statement 2025", recordedAt: at })];
    // The same instant written with a different zone or trailing zeros.
    const sameInstant = [record({ id: "a", source: "Farmer estimate", recordedAt: "2026-11-03T11:00:00.1231+01:00" }), record({ id: "b", recordedAt: at })];
    for (const pair of [byStatus, bySource, sameInstant])
      for (const records of [pair, [...pair].reverse()])
        expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_CONFLICT" });
  });

  it("F003: a legacy timestamp with no trustworthy order fails closed", () => {
    const zoneless = [record({ id: "a" }), record({ id: "b", gsrKgNHa: 60, recordedAt: "2026-02-01T09:00:00" })];
    expect(resolvePrecedingYearGsr(zoneless, "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
  });

  it("F003: an impossible or malformed legacy timestamp anywhere in the year fails closed, before or after a valid record, in either order", () => {
    const earlier = record({ id: "v-early", gsrKgNHa: 120, recordedAt: "2026-01-01T09:00:00.123100Z" });
    const feb28 = record({ id: "v-feb28", gsrKgNHa: 90, recordedAt: "2026-02-28T10:00:00.123100Z" });
    const later = record({ id: "v-late", gsrKgNHa: 80, recordedAt: "2026-12-01T09:00:00.123100Z" });
    const invalidTimestamps = [
      "2026-02-30T10:00:00.123100Z", // Feb 30 — JS would normalise to Mar 2 and win over Feb 28
      "2025-02-29T10:00:00.123100Z", // Feb 29 in a non-leap year
      "2026-02-01T24:00:00.123100Z", // hour 24 with fractional seconds
      "2026-02-01T10:60:00.123100Z", // minute 60
      "2026-02-01T10:00:60.123100Z", // second 60
      "2026-02-01T10:00:00.123100+25:00", // offset hour out of range
      "2026-02-01T10:00:00.123100+01:60", // offset minute out of range
      "2026-02-01 10:00:00.1231+15", // PostgreSQL form, offset beyond ±14:00
      "2026-02-01T10:00:00.123100", // missing timezone
      "2026-02-01 10:00:00.1231", // missing timezone, PostgreSQL form
      "2026-02-01T10:00:00.Z", // empty fraction
      "2026-02-01T10:00:00.1234567890Z", // ten fractional digits
      "2026-02-01T10:00:00.12a4Z", // non-numeric fraction
      "2026-02-01T10:00:00,123Z", // comma fraction separator
      "2026-13-01T10:00:00Z", // month 13
      "2026-00-10T10:00:00Z", // month 00
      "2026-04-31T10:00:00Z", // April 31
      "2026-02-00T10:00:00Z", // day 00
    ];
    for (const recordedAt of invalidTimestamps) {
      const bad = record({ id: "x-bad", gsrKgNHa: 60, recordedAt });
      for (const valid of [earlier, feb28, later])
        for (const records of [[bad, valid], [valid, bad]])
          expect(resolvePrecedingYearGsr(records, "2026-03-15"), recordedAt).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
      expect(resolvePrecedingYearGsr([bad], "2026-03-15"), recordedAt).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
      // Database-ordered records stay authoritative over legacy evidence.
      expect(resolvePrecedingYearGsr([bad, record({ id: "t", gsrKgNHa: 95, recordOrder: 1 })], "2026-03-15")).toMatchObject({ status: "RESOLVED", gsrKgNHa: 95, orderBasis: "DATABASE_RECORD_ORDER" });
    }
  });

  it("F003: a valid leap day, offset forms and boundary times are accepted and ordered as real instants", () => {
    const leapDay = record({ id: "leap", gsrKgNHa: 70, recordedAt: "2024-02-29T10:00:00.123100Z" });
    const before = record({ id: "pre", gsrKgNHa: 120, recordedAt: "2024-02-28T23:59:59.999999999Z" });
    for (const records of [[leapDay, before], [before, leapDay]])
      expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({ status: "RESOLVED", recordId: "leap", orderBasis: "LEGACY_RECORDED_AT" });
    expect(resolvePrecedingYearGsr([record({ recordedAt: "2000-02-29T00:00:00Z" })], "2026-03-15")).toMatchObject({ status: "RESOLVED" });
    expect(resolvePrecedingYearGsr([record({ recordedAt: "1900-02-29T00:00:00Z" })], "2026-03-15")).toMatchObject({ reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
    // 2026-02-28 23:30-01:00 is 2026-03-01 00:30Z, later than 2026-03-01 00:00Z.
    const westOffset = record({ id: "west", gsrKgNHa: 50, recordedAt: "2026-02-28 23:30:00-0100" });
    const march = record({ id: "mar", gsrKgNHa: 40, recordedAt: "2026-03-01T00:00:00+00:00" });
    for (const records of [[westOffset, march], [march, westOffset]])
      expect(resolvePrecedingYearGsr(records, "2026-03-15")).toMatchObject({ status: "RESOLVED", recordId: "west" });
    for (const recordedAt of ["2026-02-01T23:59:59.9Z", "2026-02-01T00:00:00+14:00", "2026-02-01 00:00:00-14", "2026-02-01T00:00:00.123456789-05:30"])
      expect(resolvePrecedingYearGsr([record({ recordedAt })], "2026-03-15"), recordedAt).toMatchObject({ status: "RESOLVED" });
  });

  it("F003: every database order for the year must be a positive, unique safe integer", () => {
    const orders = (...values: number[]) => values.map((recordOrder, i) => record({ id: `o${i}`, gsrKgNHa: 100 + i, recordOrder }));
    for (const bad of [orders(0), orders(-1), orders(1, 0), orders(-1, 2), orders(1, 1, 2), orders(2, 3, 2, 4), orders(1, Number.MAX_SAFE_INTEGER + 1)])
      expect(resolvePrecedingYearGsr(bad, "2026-03-15")).toMatchObject({ status: "UNRESOLVED", reasonCode: "PRECEDING_YEAR_GSR_INVALID" });
    for (const valid of [orders(1, 2, 3), orders(3, 1, 2)])
      expect(resolvePrecedingYearGsr(valid, "2026-03-15")).toMatchObject({ status: "RESOLVED", orderBasis: "DATABASE_RECORD_ORDER", gsrKgNHa: valid.find((r) => r.recordOrder === 3)?.gsrKgNHa });
    // Records for other years never affect the reference year's validation.
    const otherYear = record({ id: "x", referenceYear: "2024", recordOrder: 1 });
    expect(resolvePrecedingYearGsr([...orders(1, 2), otherYear], "2026-03-15")).toMatchObject({ status: "RESOLVED", gsrKgNHa: 101 });
    // Ordered records stay authoritative over a later-claiming legacy record.
    const legacyFuture = record({ id: "l", gsrKgNHa: 10, recordedAt: "2099-01-01T00:00:00.000Z" });
    expect(resolvePrecedingYearGsr([legacyFuture, ...orders(1, 2, 3)], "2026-03-15")).toMatchObject({ gsrKgNHa: 102, orderBasis: "DATABASE_RECORD_ORDER" });
  });

  it("only accepts a completed year's figure with a source", () => {
    expect(validateNewPrecedingYearGsrInput({ referenceYear: "2025", gsrKgNHa: 140, status: "farmer_adjusted", source: "Statement" }, "2026-11-03")).toEqual([]);
    expect(validateNewPrecedingYearGsrInput({ referenceYear: "2026", gsrKgNHa: 140, status: "farmer_adjusted", source: "Statement" }, "2026-11-03")).toEqual(["REFERENCE_YEAR_NOT_COMPLETE"]);
    expect(validateNewPrecedingYearGsrInput({ referenceYear: "2025", gsrKgNHa: -1, status: "farmer_adjusted", source: "" }, "2026-11-03")).toEqual(["GSR_INVALID", "SOURCE_REQUIRED"]);
  });
});
