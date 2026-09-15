import { describe, expect, it } from "vitest";
import { resolveSoilTestChain } from "./soil-test-history";
import type { SoilTest } from "./types";

function test(overrides: Partial<SoilTest> = {}): SoilTest {
  return {
    sampleDate: "2026-06-01",
    laboratory: "Southern Agri Labs",
    sampleRef: "SAL-2026-0001",
    p: 6.5,
    k: 90,
    pH: 6.2,
    ...overrides,
  };
}

describe("resolveSoilTestChain (Grassland Fertiliser Pilot Completion, Checkpoint B, Codex audit round 1 HIGH)", () => {
  it("makes the input active when there is no current test at all", () => {
    const result = resolveSoilTestChain(undefined, test());
    expect(result.inputBecameActive).toBe(true);
    expect(result.head).toEqual(test());
  });

  it("makes a genuinely later-dated input the new active test, chaining the previous one", () => {
    const current = test({ sampleDate: "2026-01-01", sampleRef: "OLD-1" });
    const input = test({ sampleDate: "2026-06-01", sampleRef: "NEW-1" });
    const result = resolveSoilTestChain(current, input);
    expect(result.inputBecameActive).toBe(true);
    expect(result.head.sampleRef).toBe("NEW-1");
    expect(result.head.previous).toEqual(current);
  });

  it("treats an equal sampleDate as making the input active (same-day correction)", () => {
    const current = test({ sampleDate: "2026-06-01", sampleRef: "OLD-1" });
    const input = test({ sampleDate: "2026-06-01", sampleRef: "CORRECTED-1" });
    const result = resolveSoilTestChain(current, input);
    expect(result.inputBecameActive).toBe(true);
    expect(result.head.sampleRef).toBe("CORRECTED-1");
  });

  // The real Codex audit HIGH this file exists to close: backfilling an
  // older result must never demote the genuinely newer, already-active
  // test out of the field's own current fertility evidence.
  it("never lets a backfilled OLDER input become active — inserts it into history instead", () => {
    const current = test({ sampleDate: "2026-06-01", sampleRef: "NEWER-1" });
    const input = test({ sampleDate: "2026-01-01", sampleRef: "OLDER-BACKFILL-1" });
    const result = resolveSoilTestChain(current, input);
    expect(result.inputBecameActive).toBe(false);
    // The real active test is genuinely unchanged.
    expect(result.head.sampleRef).toBe("NEWER-1");
    expect(result.head.previous?.sampleRef).toBe("OLDER-BACKFILL-1");
  });

  it("inserts a backfilled older input at the correct position in a multi-entry real history, preserving date order", () => {
    // Real chain: 2026-08 (active) -> 2025-08 -> 2024-08.
    const oldest = test({ sampleDate: "2024-08-01", sampleRef: "T2024" });
    const middle = test({ sampleDate: "2025-08-01", sampleRef: "T2025", previous: { ...oldest } });
    const current = test({ sampleDate: "2026-08-01", sampleRef: "T2026", previous: middle });

    // A real result from 2025-03 belongs strictly between T2024 and T2025.
    const input = test({ sampleDate: "2025-03-01", sampleRef: "T2025-BACKFILL" });
    const result = resolveSoilTestChain(current, input);

    expect(result.inputBecameActive).toBe(false);
    expect(result.head.sampleRef).toBe("T2026"); // active test genuinely unchanged
    expect(result.head.previous?.sampleRef).toBe("T2025");
    expect(result.head.previous?.previous?.sampleRef).toBe("T2025-BACKFILL"); // inserted here
    expect(result.head.previous?.previous?.previous?.sampleRef).toBe("T2024"); // real older history preserved
  });

  it("inserts a backfilled input older than every real test on file at the true end of the chain", () => {
    const oldest = test({ sampleDate: "2025-01-01", sampleRef: "T2025" });
    const current = test({ sampleDate: "2026-01-01", sampleRef: "T2026", previous: { ...oldest } });
    const input = test({ sampleDate: "2020-01-01", sampleRef: "ANCIENT" });

    const result = resolveSoilTestChain(current, input);
    expect(result.inputBecameActive).toBe(false);
    expect(result.head.previous?.sampleRef).toBe("T2025");
    expect(result.head.previous?.previous?.sampleRef).toBe("ANCIENT");
    expect(result.head.previous?.previous?.previous).toBeUndefined();
  });

  // Codex audit round 2 HIGH — a retried submission of the exact same
  // real result (e.g. `recordLabResultForCompositeSample`'s own
  // documented resumable-retry design) must never grow the chain with a
  // duplicate node.
  describe("idempotent resubmission (Codex audit round 2 HIGH)", () => {
    it("treats an identical guided-sampling resubmission (same labResultId) as a genuine no-op", () => {
      const current = test({ sampleDate: "2026-06-01", sampleRef: "LAB-REF-1", labResultId: "lab-result-abc", compositeSampleId: "session-1" });
      const input = test({ sampleDate: "2026-06-01", sampleRef: "LAB-REF-1", labResultId: "lab-result-abc", compositeSampleId: "session-1" });

      const result = resolveSoilTestChain(current, input);
      expect(result.inputBecameActive).toBe(false);
      expect(result.head).toBe(current); // genuinely unchanged, not even a shallow copy
      expect(result.head.previous).toBeUndefined(); // never a duplicate history node
    });

    it("treats an identical legacy/manual resubmission (no labResultId, every other field matches) as a genuine no-op", () => {
      const current = test({ sampleDate: "2026-06-01", sampleRef: "SAL-2026-0113", limeRequirement: 2.5 });
      const input = test({ sampleDate: "2026-06-01", sampleRef: "SAL-2026-0113", limeRequirement: 2.5 });

      const result = resolveSoilTestChain(current, input);
      expect(result.inputBecameActive).toBe(false);
      expect(result.head).toBe(current);
    });

    it("still treats a genuinely DIFFERENT same-day result (different labResultId) as a real new active test, not a no-op", () => {
      const current = test({ sampleDate: "2026-06-01", labResultId: "lab-result-abc" });
      const input = test({ sampleDate: "2026-06-01", sampleRef: "DIFFERENT-REF", labResultId: "lab-result-xyz" });

      const result = resolveSoilTestChain(current, input);
      expect(result.inputBecameActive).toBe(true);
      expect(result.head.labResultId).toBe("lab-result-xyz");
      expect(result.head.previous).toEqual(current);
    });

    // Codex audit round 3 HIGH — idempotency must be checked against the
    // ENTIRE real chain, not just the active head.
    it("treats a retry of an already-inserted OLDER backfilled submission as a no-op too, not just a retry of the active head", () => {
      const current = test({ sampleDate: "2026-06-01", sampleRef: "NEWER-1" });
      const backfill = test({ sampleDate: "2026-01-01", sampleRef: "OLDER-BACKFILL-1" });

      // First real submission of the backfill — inserted into history.
      const first = resolveSoilTestChain(current, backfill);
      expect(first.inputBecameActive).toBe(false);
      expect(first.head.previous?.sampleRef).toBe("OLDER-BACKFILL-1");

      // A retry of the exact same backfill submission against the
      // resulting chain must not insert a second duplicate node.
      const retry = resolveSoilTestChain(first.head, backfill);
      expect(retry.inputBecameActive).toBe(false);
      expect(retry.head).toBe(first.head); // genuinely unchanged
      expect(retry.head.previous?.previous).toBeUndefined(); // no duplicate node
    });

    it("repeated identical retries never accumulate more than one real history node", () => {
      let head: SoilTest | undefined = test({ sampleDate: "2026-01-01", sampleRef: "OLD" });
      const newer = test({ sampleDate: "2026-06-01", sampleRef: "NEW" });

      // First real submission of `newer` — becomes active, chains `head`.
      let result = resolveSoilTestChain(head, newer);
      head = result.head;
      expect(head.previous?.sampleRef).toBe("OLD");

      // Three retries of the exact same `newer` payload.
      for (let i = 0; i < 3; i++) {
        result = resolveSoilTestChain(head, newer);
        head = result.head;
      }

      expect(head.sampleRef).toBe("NEW");
      expect(head.previous?.sampleRef).toBe("OLD");
      expect(head.previous?.previous).toBeUndefined(); // no duplicate nodes accumulated
    });
  });

  // Codex audit round 2 HIGH — the public server action passes client
  // input through with no server-side date validation; a forged/non-UI
  // request must never silently replace real active fertility evidence
  // with an unorderable record.
  describe("real calendar-date validation (Codex audit round 2 HIGH)", () => {
    it("rejects a non-existent calendar date (e.g. 30 February) rather than silently normalising and promoting it to active", () => {
      const current = test({ sampleDate: "2026-06-01" });
      const input = test({ sampleDate: "2026-02-30" });
      expect(() => resolveSoilTestChain(current, input)).toThrow(/not a real calendar date/i);
    });

    it("rejects a malformed sampleDate string outright", () => {
      const input = test({ sampleDate: "not-a-date" });
      expect(() => resolveSoilTestChain(undefined, input)).toThrow(/not a real calendar date/i);
    });

    it("still accepts a genuinely valid calendar date, including a real leap-year 29 February", () => {
      const input = test({ sampleDate: "2028-02-29" });
      const result = resolveSoilTestChain(undefined, input);
      expect(result.inputBecameActive).toBe(true);
    });
  });
});
