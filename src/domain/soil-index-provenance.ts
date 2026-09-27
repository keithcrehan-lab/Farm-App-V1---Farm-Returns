/**
 * Campaign A (slurry recommendation evidence foundation), A1.2 — the one
 * place that separates a field's P/K Index into the evidence behind it:
 * the laboratory-derived index, a farmer's own override of it, and the
 * effective (working) value downstream calculations actually consume.
 *
 * Nothing new is persisted: `SoilFertility.pIndex/kIndex` are already
 * `TrackedValue` chains (`verify()` for a lab result, `farmerAdjust()` for
 * a farmer tap — `src/domain/provenance.ts`), so the original laboratory
 * node survives every override in `previous`. This module only reads that
 * chain; it never rewrites it and never changes which value a calculation
 * uses. A farmer override stays the effective value (unchanged nutrient
 * science) but is always reported as an override — never as laboratory
 * evidence.
 */

import type { DataStatus, SoilFertility, TrackedValue } from "./types";
import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";

export const SOIL_INDEX_PROVENANCE_VERSION = "soil_index_provenance_v1.0.0";

type SoilIndexValue = 1 | 2 | 3 | 4;

/**
 * - `laboratory`: the working value is the laboratory-derived index.
 * - `farmer_override_of_laboratory`: a farmer changed the index after a
 *   laboratory result; the laboratory node is still in the history.
 * - `farmer_declared_without_laboratory`: farmer-set, no laboratory node.
 * - `unconfirmed_estimate`: an estimated/mapped value nobody confirmed.
 * - `missing`: no index recorded.
 */
export type SoilIndexBasis =
  | "laboratory"
  | "farmer_override_of_laboratory"
  | "farmer_declared_without_laboratory"
  | "unconfirmed_estimate"
  | "missing";

export interface SoilIndexEvidenceNode {
  value: SoilIndexValue;
  status: DataStatus;
  source: string;
  sourceDate?: string;
}

export interface SoilIndexProvenance {
  basis: SoilIndexBasis;
  /** The value downstream calculations consume today (the chain head). */
  effective: SoilIndexEvidenceNode | null;
  /** The most recent laboratory-derived (`verified`) node in the chain. */
  laboratory: SoilIndexEvidenceNode | null;
  /** Present only when a farmer override is the effective value. */
  farmerOverride: SoilIndexEvidenceNode | null;
}

function node(tv: TrackedValue<SoilIndexValue>): SoilIndexEvidenceNode {
  return { value: tv.value, status: tv.status, source: tv.source, ...(tv.sourceDate !== undefined ? { sourceDate: tv.sourceDate } : {}) };
}

function latestLaboratoryNode(tv: TrackedValue<SoilIndexValue> | undefined): TrackedValue<SoilIndexValue> | undefined {
  for (let n = tv; n; n = n.previous) {
    if (n.status === "verified") return n;
  }
  return undefined;
}

export function resolveSoilIndexProvenance(tv: TrackedValue<SoilIndexValue> | undefined): SoilIndexProvenance {
  if (tv === undefined) return { basis: "missing", effective: null, laboratory: null, farmerOverride: null };
  const lab = latestLaboratoryNode(tv);
  const laboratory = lab ? node(lab) : null;
  if (tv.status === "verified") return { basis: "laboratory", effective: node(tv), laboratory, farmerOverride: null };
  if (tv.status === "farmer_adjusted") {
    return {
      basis: laboratory ? "farmer_override_of_laboratory" : "farmer_declared_without_laboratory",
      effective: node(tv),
      laboratory,
      farmerOverride: node(tv),
    };
  }
  return { basis: "unconfirmed_estimate", effective: node(tv), laboratory, farmerOverride: null };
}

export function resolveFieldSoilIndexProvenance(fertility: Pick<SoilFertility, "pIndex" | "kIndex">): { p: SoilIndexProvenance; k: SoilIndexProvenance } {
  return { p: resolveSoilIndexProvenance(fertility.pIndex), k: resolveSoilIndexProvenance(fertility.kIndex) };
}

/**
 * The P Index the soil-test age rule (`checkSoilTestAgeValidity`'s
 * Index-4-persists branch) is about: the laboratory's own result, never a
 * farmer override or an unconfirmed estimate. Blocked when no laboratory
 * node exists in the history.
 */
export function laboratoryPIndexForSoilTestValidity(pIndex: TrackedValue<SoilIndexValue> | undefined): EngineOutcome<SoilIndexValue> {
  const laboratory = resolveSoilIndexProvenance(pIndex).laboratory;
  if (laboratory) return ok(laboratory.value, "MEASURED");
  return blockedInsufficientEvidence("SOIL_TEST_LABORATORY_INDEX_NOT_TRACEABLE", ["laboratory-derived P Index"]);
}
