import { afterEach, describe, expect, it, vi } from "vitest";
import type { Decision } from "@/orchestration/decide";
import type { EngineOutcome } from "@/domain/evidence";
import type { WeightObservation } from "@/domain/types";

/**
 * Proves `ARCHITECTURE.md`'s reuse boundary end-to-end: Act calls the
 * *existing* `farm-data/individual-animals.ts` mutation, never a
 * reimplementation of it. Mocking that one function (not Supabase itself)
 * mirrors `farm-store.sync.test.tsx`'s existing pattern for testing a
 * caller of a `server-only` mutation module without a real database.
 */
vi.mock("@/lib/farm-data/individual-animals", () => ({
  addWeightObservation: vi.fn(),
  getWeightObservationById: vi.fn(),
}));
// Same mocking convention, extended to the two new farm-data modules this
// checkpoint wires in — proves actRecordWeightObservation calls the real
// persistence functions, without a live database.
vi.mock("@/lib/farm-data/decisions", () => ({
  insertDecision: vi.fn(),
}));
vi.mock("@/lib/farm-data/jobs", () => ({
  insertJob: vi.fn(),
}));

import { addWeightObservation, getWeightObservationById } from "@/lib/farm-data/individual-animals";
import { insertDecision } from "@/lib/farm-data/decisions";
import { insertJob } from "@/lib/farm-data/jobs";
import { actRecordWeightObservation, persistRecordWeightObservationAuditTrail } from "./index";

const mockAddWeightObservation = vi.mocked(addWeightObservation);
const mockGetWeightObservationById = vi.mocked(getWeightObservationById);
const mockInsertDecision = vi.mocked(insertDecision);
const mockInsertJob = vi.mocked(insertJob);

afterEach(() => {
  vi.clearAllMocks();
});

const testBasis: EngineOutcome<unknown> = { status: "OK", value: null, evidenceState: "MEASURED" };

const baseDecision: Decision = {
  id: "decision-1",
  promptId: "prompt-1",
  farmId: "farm-1",
  calculationKind: "weight_observation_due",
  estimateSnapshot: testBasis,
  outcome: "accepted",
  edits: { animalId: "animal-1", weightKg: 320, observedDate: "2026-08-29" },
  decidedBy: "farmer",
  decidedAt: "2026-08-29T09:00:00Z",
};

const observation: WeightObservation = {
  id: "obs-1",
  animalId: "animal-1",
  weightKg: 320,
  observedDate: "2026-08-29",
  source: "GPS job mode",
};

const decisionRecord = {
  id: "decision-1",
  farmId: "farm-1",
  promptId: "prompt-1",
  calculationKind: "weight_observation_due",
  estimateSnapshot: testBasis,
  outcome: "accepted" as const,
  edits: baseDecision.edits,
  decidedBy: "farmer" as const,
  decidedAt: "2026-08-29T09:00:00Z",
  createdAt: "2026-08-29T09:00:01Z",
};

const jobRecord = {
  id: "job-1",
  farmId: "farm-1",
  decisionId: "decision-1",
  jobType: "record_weight_observation",
  status: "confirmed" as const,
  createdAt: "2026-08-29T09:00:01Z",
  updatedAt: "2026-08-29T09:00:01Z",
};

describe("actRecordWeightObservation", () => {
  it("calls the existing farm-data mutation with the Decision's farmId/edits, never reimplementing the write", async () => {
    mockAddWeightObservation.mockResolvedValue(observation);
    mockGetWeightObservationById.mockResolvedValue(observation);
    mockInsertDecision.mockResolvedValue(decisionRecord);
    mockInsertJob.mockResolvedValue(jobRecord);

    const result = await actRecordWeightObservation(baseDecision, "GPS job mode");

    expect(mockAddWeightObservation).toHaveBeenCalledWith("farm-1", "animal-1", 320, "2026-08-29", "GPS job mode");
    expect(result).toEqual({ jobType: "record_weight_observation", decisionId: "decision-1", record: observation });
  });

  // Farm Return Next Checkpoint 2, Vertical D — proves actRecordWeightObservation
  // now really persists the decisions/jobs audit trail, not just the
  // existing weight-observation write.
  it("persists a real Decision and a Job (status: confirmed) after the weight observation succeeds", async () => {
    mockAddWeightObservation.mockResolvedValue(observation);
    mockGetWeightObservationById.mockResolvedValue(observation);
    mockInsertDecision.mockResolvedValue(decisionRecord);
    mockInsertJob.mockResolvedValue(jobRecord);

    const result = await actRecordWeightObservation(baseDecision, "GPS job mode");

    expect(mockInsertDecision).toHaveBeenCalledWith(baseDecision);
    expect(mockInsertJob).toHaveBeenCalledWith({
      farmId: "farm-1",
      decisionId: "decision-1",
      jobType: "record_weight_observation",
      status: "confirmed",
    });
    // insertDecision must be called (and awaited) before insertJob, since
    // jobs.decision_id is a not-null FK into decisions.
    expect(mockInsertDecision.mock.invocationCallOrder[0]).toBeLessThan(mockInsertJob.mock.invocationCallOrder[0]);
    expect(result.auditTrailError).toBeUndefined();
  });

  it("if the weight observation mutation itself fails, insertDecision/insertJob are never attempted and the error propagates unchanged", async () => {
    mockAddWeightObservation.mockRejectedValue(new Error("supabase unreachable"));

    await expect(actRecordWeightObservation(baseDecision, "GPS job mode")).rejects.toThrow("supabase unreachable");

    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  it("if the weight observation succeeds but persisting the Decision fails, the function still succeeds and reports it via auditTrailError, not a thrown error", async () => {
    mockAddWeightObservation.mockResolvedValue(observation);
    mockGetWeightObservationById.mockResolvedValue(observation);
    mockInsertDecision.mockRejectedValue(new Error("decisions insert failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actRecordWeightObservation(baseDecision, "GPS job mode");

    expect(result.record).toEqual(observation);
    expect(result.auditTrailError).toMatch(/decision audit-trail row failed to save.*decisions insert failed/);
    expect(mockInsertJob).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("if the weight observation and the Decision persist, but persisting the Job fails, the function still succeeds and reports it via auditTrailError, not a thrown error", async () => {
    mockAddWeightObservation.mockResolvedValue(observation);
    mockGetWeightObservationById.mockResolvedValue(observation);
    mockInsertDecision.mockResolvedValue(decisionRecord);
    mockInsertJob.mockRejectedValue(new Error("jobs insert failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actRecordWeightObservation(baseDecision, "GPS job mode");

    expect(result.record).toEqual(observation);
    expect(result.auditTrailError).toMatch(/job audit-trail row failed to save.*jobs insert failed/);
    expect(mockInsertDecision).toHaveBeenCalledWith(baseDecision);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("fails closed on a Decision missing the required edits, rather than silently coercing it", async () => {
    const malformed: Decision = { ...baseDecision, edits: { animalId: "animal-1" } };
    await expect(actRecordWeightObservation(malformed, "GPS job mode")).rejects.toThrow(/missing valid animalId\/weightKg\/observedDate/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  it("fails closed on a dismissed Decision with no edits at all", async () => {
    const dismissed: Decision = { ...baseDecision, outcome: "dismissed", edits: undefined };
    await expect(actRecordWeightObservation(dismissed, "GPS job mode")).rejects.toThrow();
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  // Codex audit finding, docs/farm-return-next/audit-logs/20260829T001857Z.md
  // (HIGH): the first version only validated edits' shape, never
  // decision.outcome/decidedBy — a dismissed decision that still carried
  // edits, or a structurally-valid auto_rule decision, would have written
  // a real record with no farmer confirmation. These pin the fix.
  it("fails closed on a dismissed Decision that still carries edits (never trust edits' presence over outcome)", async () => {
    const dismissedWithEdits: Decision = { ...baseDecision, outcome: "dismissed" };
    await expect(actRecordWeightObservation(dismissedWithEdits, "GPS job mode")).rejects.toThrow(/outcome "dismissed"/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  it("fails closed on a structurally-valid auto_rule Decision — no reviewed auto-rule may call Act yet", async () => {
    const autoRule: Decision = { ...baseDecision, decidedBy: "auto_rule" };
    await expect(actRecordWeightObservation(autoRule, "GPS job mode")).rejects.toThrow(/decided by "auto_rule"/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  // Codex audit finding (MEDIUM): edit parsing accepted NaN/infinite/
  // zero/negative weights and empty-string ids/dates through to the
  // persistence mutation.
  it.each([
    ["NaN weight", { animalId: "animal-1", weightKg: NaN, observedDate: "2026-08-29" }],
    ["infinite weight", { animalId: "animal-1", weightKg: Infinity, observedDate: "2026-08-29" }],
    ["zero weight", { animalId: "animal-1", weightKg: 0, observedDate: "2026-08-29" }],
    ["negative weight", { animalId: "animal-1", weightKg: -10, observedDate: "2026-08-29" }],
    ["empty animalId", { animalId: "", weightKg: 320, observedDate: "2026-08-29" }],
    ["empty observedDate", { animalId: "animal-1", weightKg: 320, observedDate: "" }],
  ])("fails closed on %s", async (_label, edits) => {
    const invalid: Decision = { ...baseDecision, edits };
    await expect(actRecordWeightObservation(invalid, "GPS job mode")).rejects.toThrow(/missing valid/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  // Codex audit round 11 (HIGH) — the first version never checked *which*
  // Prompt a Decision was for, or whether its own snapshot was genuinely
  // OK, so any accepted Decision with suitably-shaped edits could create
  // a real weight observation.
  it("fails closed on an accepted Decision for a different calculationKind", async () => {
    const wrongKind: Decision = { ...baseDecision, calculationKind: "spreading_window" };
    await expect(actRecordWeightObservation(wrongKind, "GPS job mode")).rejects.toThrow(/calculationKind "spreading_window"/);
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });

  it("fails closed on an accepted Decision whose estimateSnapshot is not OK", async () => {
    const blockedSnapshot: Decision = {
      ...baseDecision,
      estimateSnapshot: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_LIVESTOCK_AGE", missingInputs: ["age"] },
    };
    await expect(actRecordWeightObservation(blockedSnapshot, "GPS job mode")).rejects.toThrow(
      /estimateSnapshot has status "BLOCKED_INSUFFICIENT_EVIDENCE"/,
    );
    expect(mockAddWeightObservation).not.toHaveBeenCalled();
  });
});

// Farm Return Next Checkpoint 2, Vertical D — Codex audit HIGH,
// docs/farm-return-next/audit-logs/20260829T191227Z.md: closes the "no
// durable completion path" gap by exposing this as a separately-callable
// export, so a future caller can retry the audit trail alone.
describe("persistRecordWeightObservationAuditTrail", () => {
  it("can be called directly (not only via actRecordWeightObservation) with the same Decision, e.g. to retry after a prior partial failure", async () => {
    mockGetWeightObservationById.mockResolvedValue(observation);
    mockInsertDecision.mockResolvedValue(decisionRecord);
    mockInsertJob.mockResolvedValue(jobRecord);

    const result = await persistRecordWeightObservationAuditTrail(baseDecision, "obs-1");

    expect(mockInsertDecision).toHaveBeenCalledWith(baseDecision);
    expect(mockInsertJob).toHaveBeenCalledWith({
      farmId: "farm-1",
      decisionId: "decision-1",
      jobType: "record_weight_observation",
      status: "confirmed",
    });
    expect(result).toEqual({});
  });

  it("reports a job-insert failure via auditTrailError without throwing, leaving the already-persisted decision alone", async () => {
    mockGetWeightObservationById.mockResolvedValue(observation);
    mockInsertDecision.mockResolvedValue(decisionRecord);
    mockInsertJob.mockRejectedValue(new Error("jobs insert failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await persistRecordWeightObservationAuditTrail(baseDecision, "obs-1");

    expect(result.auditTrailError).toMatch(/job audit-trail row failed to save.*jobs insert failed/);
    consoleErrorSpy.mockRestore();
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260829T191955Z.md:
  // the first version took outcome/decidedBy as separate parameters a
  // caller could pass mismatched against `decision` itself. Now this
  // function validates the real Decision independently, the same way
  // actRecordWeightObservation does — it must not trust a caller to have
  // already validated it.
  it("validates the Decision itself and rejects a dismissed Decision even if called directly, without ever touching insertDecision/insertJob", async () => {
    const dismissed: Decision = { ...baseDecision, outcome: "dismissed", edits: undefined };
    await expect(persistRecordWeightObservationAuditTrail(dismissed, "obs-1")).rejects.toThrow(/outcome "dismissed"/);
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJob).not.toHaveBeenCalled();
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260829T194336Z.md:
  // the first version validated only the Decision, never that the
  // real-world action it claims to record actually happened — nothing in
  // the data model otherwise links a Decision to the WeightObservation it
  // authorised. Reported via auditTrailError, not thrown (see the next
  // test's own comment for why).
  it("refuses to persist decisions/jobs for an observationId that doesn't actually exist for this farm, reported via auditTrailError", async () => {
    mockGetWeightObservationById.mockResolvedValue(null);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await persistRecordWeightObservationAuditTrail(baseDecision, "obs-does-not-exist");

    expect(result.auditTrailError).toMatch(
      /existence could not be verified.*no weight observation obs-does-not-exist found for farm farm-1/,
    );
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJob).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260829T195829Z.md:
  // the first version ran this verification query *outside* any
  // try/catch, so a transient failure there (not "the observation doesn't
  // exist," the query itself failing) would throw all the way out of
  // actRecordWeightObservation past an already-successful
  // addWeightObservation — reintroducing exactly the "caller retries and
  // duplicates the mutation" risk auditTrailError exists to prevent.
  it("if the verification query itself rejects (not just finds no match), reports it via auditTrailError instead of throwing", async () => {
    mockGetWeightObservationById.mockRejectedValue(new Error("supabase unreachable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await persistRecordWeightObservationAuditTrail(baseDecision, "obs-1");

    expect(result.auditTrailError).toMatch(/existence could not be verified.*supabase unreachable/);
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJob).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260829T200643Z.md:
  // the previous version verified only that *some* observation with the
  // given id existed for the farm, never that its content actually
  // matched decision.edits — a caller (this is an independently-callable
  // retry entry point) could pass any existing same-farm observationId
  // and still have a decision/job persisted, breaking the inspectable
  // Decide/Act trace SCIENTIFIC_RULES.md requires.
  it("refuses to persist decisions/jobs for a real observation whose content doesn't match decision.edits", async () => {
    const differentObservation: WeightObservation = { ...observation, id: "obs-1", weightKg: 999 };
    mockGetWeightObservationById.mockResolvedValue(differentObservation);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await persistRecordWeightObservationAuditTrail(baseDecision, "obs-1");

    expect(result.auditTrailError).toMatch(/does not match decision decision-1's edits/);
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertJob).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
