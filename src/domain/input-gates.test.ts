import { describe, expect, it } from "vitest";
import {
  STATUTORY_CONCENTRATE_P_DEFAULT_KG_PER_100KG,
  requireCommonageStatus,
  requireConcentrateCpPercent,
  requireFeedBasis,
  requireFertiliserFormulation,
  requireSilageSaleEvidence,
  requireSlurryApplicationMethod,
  resolveConcentratePContentKgPer100kg,
  resolveLocalWaterBufferOverrideStatus,
} from "./input-gates";
import { tracked } from "./types";

describe("requireCommonageStatus", () => {
  it("blocks when never captured", () => {
    const outcome = requireCommonageStatus({});
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("UNKNOWN_COMMONAGE_STATUS");
      expect(outcome.missingInputs).toEqual(["FIELD_COMMONAGE_STATUS"]);
    }
  });

  it("blocks when explicitly captured as unknown", () => {
    const outcome = requireCommonageStatus({ commonageStatus: tracked("unknown", "estimated", "Farm Return default") });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("resolves OK with MEASURED for a farmer-verified status", () => {
    const outcome = requireCommonageStatus({ commonageStatus: tracked("commonage", "verified", "Farmer declaration") });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value).toBe("commonage");
      expect(outcome.evidenceState).toBe("MEASURED");
    }
  });

  it("resolves OK with IRISH_DEFAULT for an unconfirmed estimate", () => {
    const outcome = requireCommonageStatus({ commonageStatus: tracked("not_commonage", "estimated", "Farm Return default") });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.evidenceState).toBe("IRISH_DEFAULT");
  });
});

describe("requireSilageSaleEvidence", () => {
  it("blocks when absent", () => {
    expect(requireSilageSaleEvidence({}).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("resolves OK when present, whatever the boolean value", () => {
    const outcome = requireSilageSaleEvidence({
      saleEvidence: tracked({ hasWrittenEvidence: false }, "farmer_adjusted", "Farmer confirmation"),
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.hasWrittenEvidence).toBe(false);
  });
});

describe("requireSlurryApplicationMethod", () => {
  it("blocks when absent", () => {
    expect(requireSlurryApplicationMethod({}).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("resolves OK when present", () => {
    const outcome = requireSlurryApplicationMethod({ applicationMethod: tracked("LESS", "verified", "Contractor record") });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("LESS");
  });
});

describe("resolveLocalWaterBufferOverrideStatus", () => {
  it("blocks when never assessed", () => {
    const outcome = resolveLocalWaterBufferOverrideStatus({});
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_LOCAL_BUFFER_ASSESSMENT");
    }
  });

  it("resolves OK (not blocked) when assessed but the override status itself is unknown — AF010/GFT090", () => {
    const outcome = resolveLocalWaterBufferOverrideStatus({
      waterBufferContext: tracked({ localOverrideStatus: "unknown" as const }, "estimated", "Mapping review"),
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("unknown");
  });

  it("resolves OK with a real override status when assessed and known", () => {
    const outcome = resolveLocalWaterBufferOverrideStatus({
      waterBufferContext: tracked({ localOverrideStatus: "authoritative_rule" as const, distanceM: 50 }, "verified", "Local authority record"),
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("authoritative_rule");
  });
});

describe("requireConcentrateCpPercent", () => {
  it("blocks when absent", () => {
    expect(requireConcentrateCpPercent({}).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("resolves OK when present", () => {
    const outcome = requireConcentrateCpPercent({ cpPercent: tracked(14, "verified", "Supplier feed label") });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe(14);
  });
});

describe("resolveConcentratePContentKgPer100kg", () => {
  it("never blocks — falls back to the statutory default when unknown (CONC_P_DEFAULT_CONTENT)", () => {
    const outcome = resolveConcentratePContentKgPer100kg({});
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value).toBe(STATUTORY_CONCENTRATE_P_DEFAULT_KG_PER_100KG);
      expect(outcome.evidenceState).toBe("IRISH_DEFAULT");
    }
  });

  it("known/supplier content outranks the statutory default (GFT149)", () => {
    const outcome = resolveConcentratePContentKgPer100kg({ pContentKgPer100kg: tracked(0.7, "verified", "Supplier analysis") });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value).toBe(0.7);
      expect(outcome.evidenceState).toBe("MEASURED");
    }
  });
});

describe("requireFertiliserFormulation", () => {
  it("blocks when absent — never infer inhibitor status from the product name", () => {
    const outcome = requireFertiliserFormulation({});
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_FERTILISER_FORMULATION");
    }
  });

  it("resolves OK when present", () => {
    const outcome = requireFertiliserFormulation({
      formulation: tracked({ physicalForm: "solid" as const, ureicNPercent: 46, inhibitorStatus: "inhibited" as const }, "verified", "Product label"),
    });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.inhibitorStatus).toBe("inhibited");
  });
});

describe("requireFeedBasis", () => {
  it("blocks when absent", () => {
    expect(requireFeedBasis(undefined).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("resolves OK with DERIVED evidence state when present", () => {
    const outcome = requireFeedBasis("dry_matter");
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value).toBe("dry_matter");
      expect(outcome.evidenceState).toBe("DERIVED");
    }
  });
});
