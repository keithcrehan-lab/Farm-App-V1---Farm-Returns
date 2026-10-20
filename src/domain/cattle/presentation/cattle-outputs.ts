/**
 * Cattle C10 — the presentation input: frozen engine outputs at ONE
 * viewpoint, exactly as the frozen public exports returned them (direct
 * in-process outputs are trusted for owner semantics; C10 never re-derives
 * them). `null` / `{ ok: false }` = that engine failed closed or was not run.
 */

import type { AnimalLedger } from "../animal-ledger";
import type { AnimalSnapshot } from "../animal-snapshot";
import type { GoalProjection } from "../goals";
import type { AnimalHealthProjection } from "../health";
import type { PerformanceEvaluation } from "../performance";
import type { CattlePlanOutcome } from "../plan-interface";
import type { CattleRecommendationOutcomeResult } from "../recommendations";
import type { ScopeResolution, WeightReadContract } from "../weights";
import type { PlanAuditEvent, PlanJob, PlanJobEvaluation } from "../../plan";

export interface CattleViewpoint {
  effectiveAt: string;
  knowledgeCutoff: string;
}

export interface CattlePlanJobState {
  job: PlanJob;
  evaluation: PlanJobEvaluation | null;
  /** Viewpoint the job was created at. */
  createdAt: string;
  events: PlanAuditEvent[];
}

export interface CattleOutputs {
  viewpoint: CattleViewpoint;
  ledgers: AnimalLedger[];
  snapshots: Record<string, AnimalSnapshot | null>;
  groups: { groupRef: string; scope: ScopeResolution | null }[];
  weights: WeightReadContract | null;
  performance: PerformanceEvaluation | null;
  goals: Record<string, GoalProjection | null>;
  health: Record<string, AnimalHealthProjection | null>;
  recommendations: CattleRecommendationOutcomeResult;
  plan: CattlePlanOutcome;
  jobs: CattlePlanJobState[];
}

/**
 * Display labels for opaque refs. Supplied by the caller (the demonstration
 * directory in demo mode); a ref without a label is shown as "Unnamed …",
 * never guessed.
 */
export interface CattleDirectory {
  tagScheme: string;
  groupLabels: Readonly<Record<string, string>>;
  locationLabels: Readonly<Record<string, string>>;
  programmeLabels: Readonly<Record<string, string>>;
  obligationLabels: Readonly<Record<string, string>>;
  foodProductLabels: Readonly<Record<string, string>>;
  productLabels: Readonly<Record<string, string>>;
}
