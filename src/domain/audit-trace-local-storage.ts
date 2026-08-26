/**
 * Scientific engine V3 — Phase I: real, persistent `CalculationRun`
 * storage. Supersedes Phase 1's `audit-trace-store.ts` in-memory
 * reference implementation for actual use, per that module's own design
 * note: "a separate, independently-versioned localStorage key... never a
 * field added inside the existing farm-state blob."
 *
 * `STORAGE_KEY` here is entirely distinct from `farm-store.tsx`'s
 * `"farm-return:v1"` — a schema change to one can never invalidate or
 * corrupt the other. Additive/non-destructive: this module never reads
 * or writes any key but its own.
 */

import type { AuditTraceStore } from "./audit-trace-store";
import type { CalculationRun } from "./audit-trace";

const STORAGE_KEY = "farm-return:audit-trace:v1";
const STORAGE_VERSION = 1;

interface PersistedAuditTraceState {
  version: number;
  runs: CalculationRun[];
}

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadPersistedRuns(): CalculationRun[] {
  if (!isBrowserEnvironment()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedAuditTraceState;
    if (parsed.version !== STORAGE_VERSION) return [];
    return parsed.runs;
  } catch {
    // Corrupt/foreign JSON under this key, or storage inaccessible —
    // treat as empty rather than throw; this is provenance history, not
    // the source of truth for the farm itself.
    return [];
  }
}

function persistRuns(runs: CalculationRun[]): void {
  if (!isBrowserEnvironment()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, runs } satisfies PersistedAuditTraceState));
  } catch {
    // Private browsing / storage full / disabled — same fail-silent
    // convention `farm-store.tsx`'s own `persist()` already uses.
  }
}

/**
 * A real `AuditTraceStore` backed by `localStorage` — reads the persisted
 * set once at creation, then keeps it in memory and re-persists on every
 * `add()`. Only ever stores SEALED runs (enforced, same as Phase 1's
 * in-memory store) — a stored run is immutable both in this session and
 * across page reloads.
 */
export function createLocalStorageAuditTraceStore(): AuditTraceStore {
  let runs = loadPersistedRuns();

  return {
    add(run) {
      if (!run.sealed) {
        throw new Error(
          `Cannot store unsealed CalculationRun "${run.calculationRunId}" — only immutable, sealed runs may be persisted.`,
        );
      }
      if (runs.some((r) => r.calculationRunId === run.calculationRunId)) {
        throw new Error(`CalculationRun "${run.calculationRunId}" is already stored — a stored run is never replaced.`);
      }
      runs = [...runs, run];
      persistRuns(runs);
    },
    get(calculationRunId) {
      return runs.find((r) => r.calculationRunId === calculationRunId);
    },
    list() {
      return runs;
    },
  };
}
