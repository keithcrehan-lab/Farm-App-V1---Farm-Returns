import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createMoneyAmount, zeroMoney } from "./money";
import type { SlurryDirectEconomicAssessment, RealisationCostInput } from "./slurry-direct-economic-assessment";
import type { FertiliserPlanCostAssessment } from "./fertiliser-plan-cost";
import { createAuditedActionOpportunityRecord, AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION, type AuditedActionOpportunityRecord } from "./audited-opportunity-record";
import { ASSESSMENT_INTEGRITY_SCHEMA_VERSION } from "./assessment-integrity";
import { rankOpportunities, RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, type OpportunityRankingPolicy } from "./opportunity-ranking";
import { explainNoRankedOpportunities, listMissingSlurryPlanningDetails, listMultiSourceSlurryPlanFieldIds } from "./what-matters-no-recommendation";
import { resolveFieldSlurryAllocation } from "./nutrients";
import type { Field, SlurryAllocation } from "./types";

const asOfDate = "2026-09-25";
const knownAt = "2026-09-25T23:59:59.999Z";
const evaluatedAt = "2026-09-25T10:00:00.000Z";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function planCost(id: string): FertiliserPlanCostAssessment {
  return { id, engineVersion: "stub", asOfDate, knownAt, lines: [], aggregateOutcome: { status: "OK", value: zeroMoney("EUR"), evidenceState: "IRISH_MODEL" }, limitations: [], createdAt: "2026-01-01T00:00:00.000Z" };
}

/** Controlled fixture mirroring the pilot's real shape: a gross direct
 * benefit, a farmer-rate realisation cost, and the net Phase 5 would carry. */
function record(fieldId: string, gross: string, realisationCost: RealisationCostInput, net: { direction: "benefit" | "cost" | "zero"; amount: string } | null): AuditedActionOpportunityRecord {
  const evaluatedActionId = `slurry-allocation-${fieldId}-h1`;
  const grossValue = createMoneyAmount(gross, "EUR");
  const assessment: SlurryDirectEconomicAssessment = {
    id: `assessment-${evaluatedActionId}`, engineVersion: "fixture_engine_v1.0.0", evaluatedActionId, fieldId, asOfDate, knownAt,
    scenarios: [{ id: "baseline", role: "baseline", label: "Without" }, { id: "intervention", role: "intervention", label: "With" }],
    scienceSupport: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "fixture", missingInputs: [] }, counterfactualInvariance: { valid: true }, evaluatedActionVolumeM3: "100",
    baselineFertiliserPlanCost: planCost("b"), interventionFertiliserPlanCost: planCost("i"),
    directCostDifference: { status: "OK", value: grossValue, evidenceState: "IRISH_MODEL" }, directCostDifferenceDirection: "benefit",
    effect: {
      id: `${evaluatedActionId}:effect`, type: "AVOIDED_FERTILISER_PLAN_COST", direction: "benefit", impactKind: "ECONOMIC",
      amount: { status: "OK", value: grossValue, evidenceState: "IRISH_MODEL" }, vatTreatment: "unknown", priceBasis: "per_tonne",
      creditClaim: { creditKey: `slurry-allocation:${evaluatedActionId}`, resourceDescription: "fixture", scopeFieldId: fieldId }, scenarioId: "intervention", limitations: [],
    },
    realisationCost,
    netEconomicResult: net === null
      ? { direction: null, amount: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "REALISATION_COST_UNKNOWN", missingInputs: ["realisationCost"] } }
      : { direction: net.direction, amount: { status: "OK", value: createMoneyAmount(net.amount, "EUR"), evidenceState: "IRISH_MODEL" } },
    limitations: [], createdAt: "2026-01-01T00:00:00.000Z",
  };
  return createAuditedActionOpportunityRecord({ id: `record-${evaluatedActionId}-${asOfDate}`, assessment, recordCreatedAt: evaluatedAt, hash });
}

/** The pilot's own real ranking policy (`what-matters-pilot.ts`). */
function pilotPolicy(overrides: Partial<OpportunityRankingPolicy> = {}): OpportunityRankingPolicy {
  return {
    id: "what-matters-pilot-ranking-policy-v1", rankingMode: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, acceptedIntegritySchemaVersions: [ASSESSMENT_INTEGRITY_SCHEMA_VERSION],
    acceptedSourceEngineVersions: ["fixture_engine_v1.0.0"], acceptedRecordEngineVersions: [AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION], eligibleLifecycleStates: ["active"],
    freshness: { mode: "not_evaluated" }, includeAdverseOutcomes: false, includeZeroOutcomes: false, ...overrides,
  };
}

const rate = (amount: string): RealisationCostInput => ({ status: "quantified", amount: createMoneyAmount(amount, "EUR") });

describe("explainNoRankedOpportunities", () => {
  it("reports no candidate data when there were no slurry records to rank", () => {
    expect(explainNoRankedOpportunities([], null)).toEqual(expect.objectContaining({ code: "NO_CANDIDATE_DATA", candidates: [] }));
  });

  it("never explains away a non-empty ranking", () => {
    const records = [record("f1", "900", rate("600"), { direction: "benefit", amount: "300" })];
    expect(explainNoRankedOpportunities(records, rankOpportunities(records, new Map(), pilotPolicy(), evaluatedAt))).toBeNull();
  });

  it("reports no positive opportunity, with the exact per-field gross/cost/net/exclusion trace, when realisation cost outweighs every saving", () => {
    const records = [
      record("f1", "250", rate("600"), { direction: "cost", amount: "350" }),
      record("f2", "400", rate("400"), { direction: "zero", amount: "0" }),
    ];
    const ranking = rankOpportunities(records, new Map(), pilotPolicy(), evaluatedAt);
    const explanation = explainNoRankedOpportunities(records, ranking)!;
    expect(explanation.code).toBe("NO_POSITIVE_ECONOMIC_OPPORTUNITY");
    expect(explanation.candidates).toEqual([
      {
        recordId: records[0].id, fieldId: "f1",
        gross: { direction: "benefit", amount: { amount: "250", currency: "EUR" } },
        realisationCost: { status: "quantified", amount: { amount: "600", currency: "EUR" } },
        net: { direction: "cost", amount: { amount: "350", currency: "EUR" } },
        eligibility: { kind: "adverse_outcome_excluded" },
      },
      {
        recordId: records[1].id, fieldId: "f2",
        gross: { direction: "benefit", amount: { amount: "400", currency: "EUR" } },
        realisationCost: { status: "quantified", amount: { amount: "400", currency: "EUR" } },
        net: { direction: "zero", amount: { amount: "0", currency: "EUR" } },
        eligibility: { kind: "zero_outcome_excluded" },
      },
    ]);
  });

  it("reports missing economic evidence (never a zero net) when realisation cost is unknown", () => {
    const records = [record("f1", "250", { status: "unknown" }, null), record("f2", "250", rate("600"), { direction: "cost", amount: "350" })];
    const explanation = explainNoRankedOpportunities(records, rankOpportunities(records, new Map(), pilotPolicy(), evaluatedAt))!;
    expect(explanation.code).toBe("MISSING_ECONOMIC_EVIDENCE");
    expect(explanation.candidates[0]).toEqual(expect.objectContaining({ realisationCost: { status: "unknown", amount: null }, net: { direction: null, amount: null }, eligibility: { kind: "not_quantified" } }));
  });

  it("reports unsupported science (never missing price/cost) when Phase 5's science gate blocked the direct comparison, even with a real realisation cost", () => {
    const unsupported = record("f1", "250", rate("600"), null);
    const blockedAssessment = {
      ...unsupported.assessment,
      directCostDifference: { status: "BLOCKED_INSUFFICIENT_EVIDENCE" as const, reasonCode: "ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE", missingInputs: [] },
      directCostDifferenceDirection: null,
      effect: null,
    };
    const records = [createAuditedActionOpportunityRecord({ id: unsupported.id, assessment: blockedAssessment, recordCreatedAt: evaluatedAt, hash })];
    const explanation = explainNoRankedOpportunities(records, rankOpportunities(records, new Map(), pilotPolicy(), evaluatedAt))!;
    expect(explanation.code).toBe("UNSUPPORTED_SCIENTIFIC_EVIDENCE");
    expect(explanation.candidates[0].eligibility).toEqual({ kind: "not_quantified" });

    const mixed = [...records, record("f2", "250", { status: "unknown" }, null)];
    expect(explainNoRankedOpportunities(mixed, rankOpportunities(mixed, new Map(), pilotPolicy(), evaluatedAt))!.code).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("reports an eligibility-rule exclusion distinctly from a non-positive outcome", () => {
    const records = [record("f1", "900", rate("600"), { direction: "benefit", amount: "300" })];
    const explanation = explainNoRankedOpportunities(records, rankOpportunities(records, new Map(), pilotPolicy({ eligibleLifecycleStates: [] }), evaluatedAt))!;
    expect(explanation.code).toBe("EXCLUDED_BY_ELIGIBILITY_RULE");
    expect(explanation.candidates[0].eligibility).toEqual({ kind: "lifecycle_excluded", status: "active" });
  });

  it("reports any other audited exclusion as its own category", () => {
    const records = [record("f1", "900", rate("600"), { direction: "benefit", amount: "300" })];
    const explanation = explainNoRankedOpportunities(records, rankOpportunities(records, new Map(), pilotPolicy({ acceptedSourceEngineVersions: [] }), evaluatedAt))!;
    expect(explanation.code).toBe("OTHER_AUDITED_EXCLUSION");
    expect(explanation.candidates[0].eligibility.kind).toBe("unsupported_source_engine_version");
  });
});

describe("listMissingSlurryPlanningDetails", () => {
  const tracked = <T,>(value: T) => ({ value, status: "farmer_adjusted" as const, source: "Farmer" });
  const field = (id: string) => ({ id }) as Field;
  const allocation = (fieldId: string, housingId: string, overrides: Partial<SlurryAllocation> = {}): SlurryAllocation => ({
    fieldId, housingId, priority: "high", volumeM3: 100, score: 90,
    applicationMethod: tracked("LESS" as const), applicationDate: tracked("2026-02-15"), ...overrides,
  });

  it("reports only the details each field is actually missing", () => {
    expect(listMissingSlurryPlanningDetails(
      [field("a"), field("b"), field("c"), field("d")],
      [
        allocation("a", "h1", { applicationMethod: undefined }),
        allocation("b", "h1", { applicationDate: undefined }),
        allocation("c", "h1", { applicationMethod: undefined, applicationDate: undefined }),
        allocation("d", "h1"),
      ],
    )).toEqual([
      { fieldId: "a", missing: ["method"] },
      { fieldId: "b", missing: ["date"] },
      { fieldId: "c", missing: ["method", "date"] },
    ]);
  });

  it("ignores fields with no allocation or only a not-suitable one", () => {
    expect(listMissingSlurryPlanningDetails([field("a"), field("b")], [allocation("b", "h1", { priority: "not_suitable", applicationMethod: undefined })])).toEqual([]);
  });

  it("never points the farmer at details they have already given (e.g. two sources with conflicting methods)", () => {
    const conflicting = [allocation("a", "h1"), allocation("a", "h2", { applicationMethod: tracked("splashplate" as const) })];
    expect(listMissingSlurryPlanningDetails([field("a")], conflicting)).toEqual([]);
  });

  it("never offers completion for a field fed by more than one housing source — dates cannot make it a candidate (audit MEDIUM)", () => {
    const multiSourceMissingDate = [allocation("a", "h1", { applicationDate: undefined }), allocation("a", "h2")];
    expect(listMissingSlurryPlanningDetails([field("a")], multiSourceMissingDate)).toEqual([]);
    expect(listMultiSourceSlurryPlanFieldIds([field("a")], multiSourceMissingDate)).toEqual(["a"]);

    // Even with every visible date completed, the unchanged resolver still
    // yields no combined date, so the pilot's candidate builder (method AND
    // date required) keeps skipping this field.
    const completed = [allocation("a", "h1"), allocation("a", "h2")];
    const resolved = resolveFieldSlurryAllocation(completed, "a");
    expect(resolved?.applicationDate).toBeUndefined();
    expect(listMissingSlurryPlanningDetails([field("a")], completed)).toEqual([]);
    expect(listMultiSourceSlurryPlanFieldIds([field("a")], completed)).toEqual(["a"]);
  });

  it("single-source missing method/date still gets the completion step, and is not reported as multi-source", () => {
    const single = [allocation("a", "h1", { applicationMethod: undefined, applicationDate: undefined }), allocation("a", "h2", { priority: "not_suitable" })];
    expect(listMissingSlurryPlanningDetails([field("a")], single)).toEqual([{ fieldId: "a", missing: ["method", "date"] }]);
    expect(listMultiSourceSlurryPlanFieldIds([field("a")], single)).toEqual([]);
    const done = [allocation("a", "h1")];
    const resolved = resolveFieldSlurryAllocation(done, "a");
    expect(resolved?.applicationMethod && resolved.applicationDate).toBeTruthy();
    expect(listMissingSlurryPlanningDetails([field("a")], done)).toEqual([]);
  });
});
