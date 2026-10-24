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
import type { CattlePlanOutcome, CattlePlanProposalGroup } from "../plan-interface";
import type { CattleRecommendationOutcomeResult, RecommendationRecord } from "../recommendations";
import type { ScopeResolution, WeightReadContract } from "../weights";
import type { PlanAuditEvent, PlanJob, PlanJobEvaluation } from "../../plan";

export interface CattleViewpoint {
  effectiveAt: string;
  knowledgeCutoff: string;
}

/**
 * What raised a Plan job, kept with the job for its whole life (F001): the C9 proposal group of the run that
 * created it and, for a C8 action, the C8 record that group cites (bound by the group's own C8 output id —
 * never a record matched by kind alone). A later run that no longer proposes the work never erases it.
 */
export interface CattlePlanJobOrigin {
  /** The viewpoint of the creating run. */
  at: string;
  /** `null`: the creating run had no proposal group for the job's identity. */
  group: CattlePlanProposalGroup | null;
  recommendation:
    | { state: "BOUND"; record: RecommendationRecord }
    /** The job comes from no C8 output (a programme, a requirement). */
    | { state: "NOT_C8" }
    /** C8 failed in the creating run, or none of its records is the one the group cites. */
    | { state: "UNAVAILABLE" };
}

/**
 * What the LATEST planning run says about a retained job (F019) — current state only, replaced on every run by the
 * replay's reconciliation; never the job's evidence (that is `origin`). PROPOSED: the run proposes the job's Plan
 * identity, and the job's blockers and priority are that proposal's. NOT_PROPOSED: the run no longer proposes it, so
 * no blocker is current. UNAVAILABLE: the run failed, so the current state isn't known (the last evaluation is not fresh).
 */
export type CattlePlanJobCurrent = { state: "PROPOSED" | "NOT_PROPOSED" | "UNAVAILABLE"; at: string };

export interface CattlePlanJobState {
  job: PlanJob;
  evaluation: PlanJobEvaluation | null;
  /** Viewpoint the job was created at. */
  createdAt: string;
  events: PlanAuditEvent[];
  /** `null`: the origin wasn't recorded — its evidence is shown as unavailable, never borrowed from a later run. */
  origin: CattlePlanJobOrigin | null;
  /** `null`: not recorded — the current state is unknown, never "still raised" or "no blockers". */
  current: CattlePlanJobCurrent | null;
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
