import { describe, expect, it } from "vitest";
import { parseCsoFertiliserCsv, parseCsoFertiliserMetadata } from "./cso-fertiliser-parser";
import { CSO_AJM09_REAL_CSV_SAMPLE, CSO_AJM09_REAL_METADATA_SAMPLE } from "./cso-fertiliser-client.real-fixtures";
import {
  ALL_ROWS_MALFORMED_CSV,
  EMPTY_BODY_CSV,
  HEADER_ONLY_NO_DATA_CSV,
  INVALID_DECIMAL_CSV,
  MALFORMED_HEADER_CSV,
  MALFORMED_METADATA_JSON,
  MISSING_DIMENSIONS_CSV,
  MISSING_VALUE_CSV,
  UNSUPPORTED_UNIT_CSV,
  VALID_MINIMAL_CSV,
  VALID_MINIMAL_METADATA_JSON,
} from "./cso-fertiliser-parser.fixtures";

describe("parseCsoFertiliserCsv", () => {
  it("1. parses a valid official-shaped response", () => {
    const result = parseCsoFertiliserCsv(VALID_MINIMAL_CSV);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ seriesCode: "012", seriesLabel: "Compound 18-6-12", referencePeriod: "2026-07", value: { status: "present", raw: "645" } });
  });

  it("2. rejects a malformed/unrecognised header as schema_unrecognised", () => {
    const result = parseCsoFertiliserCsv(MALFORMED_HEADER_CSV);
    expect(result.status).toBe("schema_unrecognised");
  });

  it("3. rejects rows with missing dataset dimensions (wrong field count) without accepting them", () => {
    const result = parseCsoFertiliserCsv(MISSING_DIMENSIONS_CSV);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rows).toHaveLength(1);
    expect(result.rejectedRowCount).toBe(1);
  });

  it("4. preserves a missing monetary value as status:'missing', never a fabricated zero", () => {
    const result = parseCsoFertiliserCsv(MISSING_VALUE_CSV);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    const missingRow = result.rows.find((r) => r.seriesCode === "0201");
    expect(missingRow?.value).toEqual({ status: "missing" });
    const presentRow = result.rows.find((r) => r.seriesCode === "012");
    expect(presentRow?.value).toEqual({ status: "present", raw: "645" });
  });

  it("5. rejects an invalid decimal VALUE rather than passing it through", () => {
    const result = parseCsoFertiliserCsv(INVALID_DECIMAL_CSV);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rows).toHaveLength(1);
    expect(result.rejectedRowCount).toBe(1);
    expect(result.rejectedSamples.join(" ")).toMatch(/unparseable VALUE/);
  });

  it("6. rejects an unsupported unit", () => {
    const result = parseCsoFertiliserCsv(UNSUPPORTED_UNIT_CSV);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rows).toHaveLength(1);
    expect(result.rejectedSamples.join(" ")).toMatch(/unsupported UNIT/);
  });

  it("7. reference period is preserved as a canonical YYYY-MM string, distinct from any retrieval time", () => {
    const result = parseCsoFertiliserCsv(VALID_MINIMAL_CSV);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rows[0].referencePeriod).toBe("2026-07");
  });

  it("8. source series identity (code + label) is preserved verbatim", () => {
    const result = parseCsoFertiliserCsv(VALID_MINIMAL_CSV);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.rows[0].seriesCode).toBe("012");
    expect(result.rows[0].seriesLabel).toBe("Compound 18-6-12");
  });

  it("9. an unexpected source schema fails closed rather than guessing", () => {
    expect(parseCsoFertiliserCsv(EMPTY_BODY_CSV).status).toBe("schema_unrecognised");
    expect(parseCsoFertiliserCsv(HEADER_ONLY_NO_DATA_CSV).status).toBe("schema_unrecognised");
    expect(parseCsoFertiliserCsv(ALL_ROWS_MALFORMED_CSV).status).toBe("schema_unrecognised");
  });

  it("10. parses the real captured CSO sample end to end", () => {
    const result = parseCsoFertiliserCsv(CSO_AJM09_REAL_CSV_SAMPLE);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    // 4 months x 4 real products = 16 present rows + 4 genuinely missing
    // (Compound 10-7-23 is suppressed every month in this real sample).
    expect(result.rows.filter((r) => r.value.status === "present")).toHaveLength(16);
    expect(result.rows.filter((r) => r.value.status === "missing")).toHaveLength(4);
    expect(result.rejectedRowCount).toBe(0);
  });

  it("strips a leading UTF-8 BOM, a real feature of the live response", () => {
    const withBom = `﻿${VALID_MINIMAL_CSV}`;
    const result = parseCsoFertiliserCsv(withBom);
    expect(result.status).toBe("ok");
  });
});

describe("parseCsoFertiliserMetadata", () => {
  it("extracts updatedAt and revision reasons from a valid document", () => {
    const meta = parseCsoFertiliserMetadata(VALID_MINIMAL_METADATA_JSON);
    expect(meta.updatedAt).toBe("2026-09-15T11:00:00.000Z");
    expect(meta.revisionReasons).toEqual(["Planned Routine Revision"]);
  });

  it("extracts real metadata from the live-captured sample, including the routine-revision reason", () => {
    const meta = parseCsoFertiliserMetadata(CSO_AJM09_REAL_METADATA_SAMPLE);
    expect(meta.updatedAt).toBe("2026-09-15T11:00:00.000Z");
    expect(meta.revisionReasons).toContain("Planned Routine Revision");
  });

  it("degrades gracefully (never throws) on malformed metadata", () => {
    expect(() => parseCsoFertiliserMetadata(MALFORMED_METADATA_JSON)).not.toThrow();
    expect(parseCsoFertiliserMetadata(MALFORMED_METADATA_JSON)).toEqual({ updatedAt: null, revisionReasons: [] });
  });
});
