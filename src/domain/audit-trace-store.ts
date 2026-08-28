/**
 * Scientific engine V3 foundation — an in-memory reference implementation
 * of a `CalculationRun` store. Phase 1 (see `src/domain/evidence.ts`'s
 * header for the phase note).
 *
 * This is explicitly NOT production persistence. There is no database in
 * this app today; the real farm state lives in a versioned `localStorage`
 * blob (`farm-store.tsx`'s `STORAGE_KEY = "farm-return:v1"`). When a later
 * phase starts writing real `CalculationRun`s from real calculations, that
 * phase should give audit-trace persistence its own, separately-versioned
 * localStorage key (e.g. `"farm-return:audit-trace:v1"`) — never a field
 * added inside the existing farm-state blob — so a schema change in one
 * can never invalidate the other. This module exists only so `audit-trace
 * .ts`'s types/builders have something to be exercised against in tests
 * (and so a future real store has a reference shape to match), not to be
 * wired into any screen or the real `FarmProvider` in this phase.
 */

import type { CalculationRun } from "./audit-trace";

export interface AuditTraceStore {
  /** Stores a sealed run. Throws if the run isn't sealed (an unsealed run
   * is still subject to change — nothing "historical" exists to store
   * yet) or if a run with the same `calculationRunId` is already stored
   * (a stored run is never replaced, only ever added). */
  add(run: CalculationRun): void;
  get(calculationRunId: string): CalculationRun | undefined;
  /** Returns every stored run, oldest first. */
  list(): CalculationRun[];
}

export function createInMemoryAuditTraceStore(): AuditTraceStore {
  const runs = new Map<string, CalculationRun>();

  return {
    add(run) {
      if (!run.sealed) {
        throw new Error(
          `Cannot store unsealed CalculationRun "${run.calculationRunId}" — only immutable, sealed runs may be persisted.`,
        );
      }
      if (runs.has(run.calculationRunId)) {
        throw new Error(`CalculationRun "${run.calculationRunId}" is already stored — a stored run is never replaced.`);
      }
      runs.set(run.calculationRunId, run);
    },
    get(calculationRunId) {
      return runs.get(calculationRunId);
    },
    list() {
      return Array.from(runs.values());
    },
  };
}
