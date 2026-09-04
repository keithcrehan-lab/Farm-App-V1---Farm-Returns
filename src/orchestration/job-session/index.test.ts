import { afterEach, describe, expect, it, vi } from "vitest";

// GPS Job Mode campaign, 2026-09-04: proves startManualJobSession's own
// origin/deviceMetadata passthrough calls the real persistence functions
// with the right values, without a live database — same mocking
// convention `src/orchestration/act/index.test.ts` already establishes
// for exactly this kind of "prove the real orchestration function calls
// the real farm-data function correctly" test.
vi.mock("@/lib/farm-data/decisions", () => ({ insertDecision: vi.fn() }));
vi.mock("@/lib/farm-data/job-sessions", () => ({ insertJobSession: vi.fn() }));

import {
  assertManualJobStartValueHasNoOutcomeKeys,
  constructManualJobStartDecision,
  startManualJobSession,
  MANUAL_JOB_START_RESERVED_OUTCOME_KEYS,
} from "./index";
import { insertDecision } from "@/lib/farm-data/decisions";
import { insertJobSession } from "@/lib/farm-data/job-sessions";
import type { JobSessionRecord } from "@/lib/farm-data/mappers";
import type { Decision } from "@/orchestration/decide";

const mockInsertDecision = vi.mocked(insertDecision);
const mockInsertJobSession = vi.mocked(insertJobSession);

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Direct tests for `constructManualJobStartDecision`'s resolved MEASURED
 * evidence-tier decision (`docs/farm-return-next/BLOCKERS.md`'s "MEASURED
 * evidence-tier judgment call — resolved" entry). The prior session left
 * this as a disclosed, open judgment call; this session's own brief asked
 * for a precise semantics decision: `MEASURED` here classifies only the
 * authorisation event itself (a real, direct, zero-inference fact — the
 * farmer tapped Start, for this activityType, at this timestamp), never
 * the underlying agricultural activity's own outcome (quantity, area,
 * completion), which stays entirely unclassified until a real Confirm
 * Actual exists. These tests prove the current implementation honours
 * that boundary, and guard against a future edit silently widening it.
 */
describe("constructManualJobStartDecision", () => {
  it("uses evidenceState MEASURED, scoped to a narrow authorisation-event marker only — never an agricultural-outcome value", () => {
    const decision = constructManualJobStartDecision({
      farmId: "farm-1",
      activityType: "fertiliser_spreading",
      decidedAt: "2026-09-02T10:00:00Z",
    });

    expect(decision.estimateSnapshot.status).toBe("OK");
    if (decision.estimateSnapshot.status !== "OK") throw new Error("unreachable");
    expect(decision.estimateSnapshot.evidenceState).toBe("MEASURED");
    expect(decision.estimateSnapshot.value).toEqual({ manual: true, activityType: "fertiliser_spreading" });
  });

  it("never carries any of the reserved agricultural-outcome keys on its value — a real regression guard, not just documentation", () => {
    const decision = constructManualJobStartDecision({
      farmId: "farm-1",
      activityType: "slurry_spreading",
      decidedAt: "2026-09-02T10:00:00Z",
    });

    expect(decision.estimateSnapshot.status).toBe("OK");
    if (decision.estimateSnapshot.status !== "OK") throw new Error("unreachable");
    const valueKeys = Object.keys(decision.estimateSnapshot.value as Record<string, unknown>);
    for (const reservedKey of MANUAL_JOB_START_RESERVED_OUTCOME_KEYS) {
      expect(valueKeys).not.toContain(reservedKey);
    }
  });

  it("still authorises the session via a real, accepted Decision (outcome/decidedBy/kind), matching every other real Job Session start's own authorisation invariant", () => {
    const decision = constructManualJobStartDecision({
      farmId: "farm-1",
      activityType: "field_inspection",
      fieldId: "field-7",
      decidedAt: "2026-09-02T10:00:00Z",
    });

    expect(decision.outcome).toBe("accepted");
    expect(decision.decidedBy).toBe("farmer");
    expect(decision.calculationKind).toBe("manual_job_start");
    expect(decision.farmId).toBe("farm-1");
    expect(decision.fieldId).toBe("field-7");
  });

  it("assertManualJobStartValueHasNoOutcomeKeys genuinely throws on any key beyond {manual, activityType} — real coverage of the throwing branch itself, not just a check against a hardcoded literal that always passes (Codex audit LOW, round 1 of this phase's own Dev-validation audit)", () => {
    expect(() => assertManualJobStartValueHasNoOutcomeKeys({ manual: true, activityType: "fertiliser_spreading" })).not.toThrow();
    for (const reservedKey of MANUAL_JOB_START_RESERVED_OUTCOME_KEYS) {
      expect(() =>
        assertManualJobStartValueHasNoOutcomeKeys({ manual: true, activityType: "fertiliser_spreading", [reservedKey]: 1 }),
      ).toThrow(/must never carry any key beyond/);
    }
    // An allowlist, not merely the specific named denylist above — a
    // key that isn't even on the reserved list yet still throws.
    expect(() =>
      assertManualJobStartValueHasNoOutcomeKeys({ manual: true, activityType: "fertiliser_spreading", yield: 42 }),
    ).toThrow(/must never carry any key beyond/);
  });

  it("produces a distinct promptId per real call, keyed on activityType and the real decidedAt timestamp — not a constant, and not colliding across two different manual starts at the same instant for two different activities", () => {
    const a = constructManualJobStartDecision({ farmId: "farm-1", activityType: "silage", decidedAt: "2026-09-02T10:00:00Z" });
    const b = constructManualJobStartDecision({ farmId: "farm-1", activityType: "livestock_work", decidedAt: "2026-09-02T10:00:00Z" });
    expect(a.promptId).not.toBe(b.promptId);
  });
});

// GPS Job Mode campaign, 2026-09-04.
describe("startManualJobSession — origin/deviceMetadata passthrough", () => {
  function stubbedDecision(overrides: Partial<Decision> = {}): Decision & { decidedBy: "farmer" } {
    return {
      id: "decision-1",
      farmId: "farm-1",
      promptId: "manual:fertiliser_spreading:2026-09-04T10:00:00Z",
      calculationKind: "manual_job_start",
      estimateSnapshot: { status: "OK", value: { manual: true, activityType: "fertiliser_spreading" }, evidenceState: "MEASURED" },
      outcome: "accepted",
      decidedAt: "2026-09-04T10:00:00Z",
      ...overrides,
      decidedBy: "farmer",
    };
  }

  const stubbedJobSession = { id: "session-1" } as JobSessionRecord;

  it("defaults to origin 'manual' and no deviceMetadata when neither is supplied — every existing caller's behaviour is unchanged", async () => {
    mockInsertDecision.mockResolvedValue({ ...stubbedDecision(), createdAt: "2026-09-04T10:00:00Z" });
    mockInsertJobSession.mockResolvedValue(stubbedJobSession);

    await startManualJobSession({
      farmId: "farm-1",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
      decidedAt: "2026-09-04T10:00:00Z",
    });

    expect(mockInsertJobSession).toHaveBeenCalledWith(expect.objectContaining({ origin: "manual", deviceMetadata: undefined }));
  });

  it("passes origin 'detected' and the real GPS detection evidence straight through to insertJobSession — a real GPS Activity Candidate confirmation, not a plain manual start", async () => {
    mockInsertDecision.mockResolvedValue({ ...stubbedDecision(), createdAt: "2026-09-04T10:00:00Z" });
    mockInsertJobSession.mockResolvedValue(stubbedJobSession);

    const deviceMetadata = { detectionSource: "gps_activity_candidate" as const, confidence: "medium" as const, sampleCount: 4, firstObservedAt: "2026-09-04T10:00:00.000Z" };
    await startManualJobSession({
      farmId: "farm-1",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
      decidedAt: "2026-09-04T10:00:00Z",
      primaryFieldId: "field-home",
      origin: "detected",
      deviceMetadata,
    });

    expect(mockInsertJobSession).toHaveBeenCalledWith(expect.objectContaining({ origin: "detected", deviceMetadata, primaryFieldId: "field-home" }));
  });

  it("Codex audit round 1: rejects origin 'detected' with missing, malformed, or fabricated-shape deviceMetadata — never persists unvalidated detection provenance", async () => {
    mockInsertDecision.mockResolvedValue({ ...stubbedDecision(), createdAt: "2026-09-04T10:00:00Z" });
    mockInsertJobSession.mockResolvedValue(stubbedJobSession);

    const base = { farmId: "farm-1", activityType: "fertiliser_spreading", jobSessionId: "session-1", decidedAt: "2026-09-04T10:00:00Z", origin: "detected" as const };

    await expect(startManualJobSession(base)).rejects.toThrow(/requires deviceMetadata/);
    await expect(startManualJobSession({ ...base, deviceMetadata: { confidence: "medium", sampleCount: 4, firstObservedAt: null } })).rejects.toThrow(/requires deviceMetadata/);
    await expect(startManualJobSession({ ...base, deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "very_high", sampleCount: 4, firstObservedAt: null } })).rejects.toThrow(/requires deviceMetadata/);
    await expect(startManualJobSession({ ...base, deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "medium", sampleCount: -1, firstObservedAt: null } })).rejects.toThrow(/requires deviceMetadata/);
    expect(mockInsertJobSession).not.toHaveBeenCalled();
  });

  it("Codex audit round 1: silently drops deviceMetadata for a non-'detected' origin — a manual start can never carry detection-looking evidence", async () => {
    mockInsertDecision.mockResolvedValue({ ...stubbedDecision(), createdAt: "2026-09-04T10:00:00Z" });
    mockInsertJobSession.mockResolvedValue(stubbedJobSession);

    await startManualJobSession({
      farmId: "farm-1",
      activityType: "fertiliser_spreading",
      jobSessionId: "session-1",
      decidedAt: "2026-09-04T10:00:00Z",
      origin: "manual",
      // A caller (bypassing the real UI) claiming detection-looking
      // evidence on a manual start — must never reach persistence.
      deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "high", sampleCount: 999, firstObservedAt: null },
    });

    expect(mockInsertJobSession).toHaveBeenCalledWith(expect.objectContaining({ origin: "manual", deviceMetadata: undefined }));
  });

  it("Codex audit round 2: rejects internally-incoherent 'detected' shapes round 1's own validator still let through", async () => {
    mockInsertDecision.mockResolvedValue({ ...stubbedDecision(), createdAt: "2026-09-04T10:00:00Z" });
    mockInsertJobSession.mockResolvedValue(stubbedJobSession);
    const base = { farmId: "farm-1", activityType: "fertiliser_spreading", jobSessionId: "session-1", decidedAt: "2026-09-04T10:00:00Z", primaryFieldId: "field-home", origin: "detected" as const };

    // sampleCount: 0 — a real detector can never fire candidate_start
    // with zero accepted samples.
    await expect(
      startManualJobSession({ ...base, deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "medium", sampleCount: 0, firstObservedAt: "2026-09-04T09:57:00.000Z" } }),
    ).rejects.toThrow(/requires deviceMetadata/);

    // "low" confidence — the real detector never returns this at the
    // moment candidate_start actually fires.
    await expect(
      startManualJobSession({ ...base, deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "low", sampleCount: 5, firstObservedAt: "2026-09-04T09:57:00.000Z" } }),
    ).rejects.toThrow(/requires deviceMetadata/);

    // "high" confidence with only just-enough samples — internally
    // inconsistent with computeStartConfidence's own real "strong
    // samples" requirement (double the minimum).
    await expect(
      startManualJobSession({ ...base, deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "high", sampleCount: 3, firstObservedAt: "2026-09-04T09:57:00.000Z" } }),
    ).rejects.toThrow(/requires deviceMetadata/);

    // A malformed (unparseable) firstObservedAt.
    await expect(
      startManualJobSession({ ...base, deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "medium", sampleCount: 5, firstObservedAt: "not-a-real-date" } }),
    ).rejects.toThrow(/requires deviceMetadata/);

    // An extra, undeclared property — never a documented, real shape.
    await expect(
      startManualJobSession({
        ...base,
        deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "medium", sampleCount: 5, firstObservedAt: "2026-09-04T09:57:00.000Z", note: "trust me" },
      }),
    ).rejects.toThrow(/requires deviceMetadata/);

    expect(mockInsertJobSession).not.toHaveBeenCalled();
  });

  it("Codex audit round 2: rejects a 'detected' origin with no primaryFieldId — a real GPS candidate is never fieldless", async () => {
    mockInsertDecision.mockResolvedValue({ ...stubbedDecision(), createdAt: "2026-09-04T10:00:00Z" });
    mockInsertJobSession.mockResolvedValue(stubbedJobSession);

    await expect(
      startManualJobSession({
        farmId: "farm-1",
        activityType: "fertiliser_spreading",
        jobSessionId: "session-1",
        decidedAt: "2026-09-04T10:00:00Z",
        origin: "detected",
        deviceMetadata: { detectionSource: "gps_activity_candidate", confidence: "medium", sampleCount: 5, firstObservedAt: "2026-09-04T09:57:00.000Z" },
      }),
    ).rejects.toThrow(/primaryFieldId/);
    expect(mockInsertJobSession).not.toHaveBeenCalled();
  });
});
