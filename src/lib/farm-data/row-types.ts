/**
 * Real Farm V1 Phase 3 — TypeScript shapes for `supabase/migrations/
 * 20260828000000_init_farm_schema.sql`'s rows, one interface per table.
 * `jsonb` columns are typed directly as the domain `TrackedValue<T>`/
 * composite type they store — Supabase's client parses `jsonb` to a plain
 * JS object already, so these are an assumption about what was written,
 * not a runtime-validated boundary (nothing in this codebase runtime-
 * validates the mock data layer's shapes either — see `mock-farm.ts`).
 *
 * Keep in sync with the migration by hand; see that file's own header
 * comment for why a generated-types tool wasn't used instead (no live
 * Supabase project to generate from yet, in this environment).
 */
import type {
  Confidence,
  DataStatus,
  FieldSeasonRecord,
  FieldUse,
  MappedSoil,
  Provenance,
  RegulatoryStatus,
  SoilFertility,
  TankDetail,
  Versioned,
} from "@/domain/types";
import type { EngineOutcome } from "@/domain/evidence";

// Re-export the shape TrackedValue<T> serialises to for row typing —
// identical fields, just not importing the constructor helpers here.
export interface TrackedValueRow<T> extends Provenance, Versioned, Confidence, RegulatoryStatus {
  value: T;
  status: DataStatus;
  previous?: TrackedValueRow<T>;
}

export interface FarmRow {
  id: string;
  user_id: string;
  name: string;
  county: string;
  centroid_lng: number;
  centroid_lat: number;
  primary_enterprises: string[];
  units: "metric";
  owner_name: string;
  p_build_up_compliance: TrackedValueRow<{
    adviserEngaged: boolean;
    nmpSubmitted: boolean;
    trainingCompleted: boolean;
  }> | null;
  /** Real Mode Completion Phase 2/3 — onboarding resumability; not part
   * of the domain `Farm` type (it's onboarding process metadata, not a
   * farm fact), read directly by `getOnboardingStatusForCurrentUser`. */
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldRow {
  id: string;
  farm_id: string;
  name: string;
  area_ha: number;
  centroid_lng: number;
  centroid_lat: number;
  polygon: GeoJSON.Polygon | null;
  polygon_source: "farmer_drawn" | null;
  polygon_captured_at: string | null;
  lpis_ref: string | null;
  // Codex remediation Priority 2/6 — both genuinely nullable now (see
  // `20260828060000_honest_field_defaults.sql`): a new field is created
  // boundary-first with neither a planned use nor a mapped soil yet, and
  // no fabricated placeholder is written in their place.
  planned_use: TrackedValueRow<FieldUse> | null;
  mapped_soil: MappedSoil | null;
  fertility: SoilFertility;
  commonage_status: TrackedValueRow<"commonage" | "not_commonage" | "unknown"> | null;
  water_buffer_context: TrackedValueRow<{
    nearestFeature?: string;
    distanceM?: number;
    localOverrideStatus: "authoritative_rule" | "verified_none" | "unknown";
    featureType?: string;
    localOverrideDistanceM?: number;
  }> | null;
  history: FieldSeasonRecord[];
  thumbnail: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HousingRow {
  id: string;
  farm_id: string;
  shed_name: string;
  shed_type: "slatted" | "straw_bedded" | "other";
  housing_period_start: string;
  housing_period_end: string;
  tank_refinement: TankDetail | null;
  slurry_estimate: {
    volumeM3: TrackedValueRow<number>;
    availableN: TrackedValueRow<number>;
    availableP: TrackedValueRow<number>;
    availableK: TrackedValueRow<number>;
    ruleSetVersion: string;
  };
  storage_capacity_m3: number;
  storage_fill_pct: number;
  created_at: string;
  updated_at: string;
}

export interface LivestockGroupRow {
  id: string;
  farm_id: string;
  category: string;
  label: string;
  count: TrackedValueRow<number>;
  avg_weight_kg: TrackedValueRow<number> | null;
  avg_age_months: number | null;
  breed: string | null;
  sex: "male" | "female" | "mixed" | null;
  system: "grazing" | "housed";
  housing_id: string | null;
  goal: "maintain" | "grow" | "breed" | "sell_store" | "finish_slaughter" | null;
  value: TrackedValueRow<number>;
  status_label: string | null;
  avg_milk_yield_kg_per_year: TrackedValueRow<number> | null;
  created_at: string;
  updated_at: string;
}

export interface SlurryAllocationRow {
  id: string;
  farm_id: string;
  field_id: string;
  housing_id: string;
  priority: "high" | "medium" | "not_suitable";
  volume_m3: number;
  score: number;
  application_method: TrackedValueRow<"LESS" | "splashplate" | "incorporate_24h" | "other"> | null;
  created_at: string;
  updated_at: string;
}

export interface LivestockIndividualRow {
  id: string;
  farm_id: string;
  group_id: string | null;
  tag_number: string | null;
  category: string;
  sex: "male" | "female" | null;
  breed: string | null;
  date_of_birth: string | null;
  goal_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeightObservationRow {
  id: string;
  farm_id: string;
  animal_id: string;
  weight_kg: number;
  observed_date: string;
  source: string;
  created_at: string;
}

export interface FinancialAssumptionRow {
  id: string;
  farm_id: string;
  key: string;
  value: TrackedValueRow<number>;
  unit: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Farm Return Next Checkpoint 2, Vertical D — `supabase/migrations/
 * 20260829000000_orchestration_foundation.sql`'s `decisions` table, plus
 * the `field_id`/`calculation_version`/`inputs_snapshot` columns
 * `20260829010000_decisions_jobs_client_access.sql` adds (Codex audit
 * HIGH on this checkpoint's first draft, `docs/farm-return-next/
 * audit-logs/20260829T190434Z.md`: `Decision`'s own trace fields had no
 * columns to persist into). `estimate_snapshot` is typed directly as
 * `EngineOutcome<unknown>` (the shape `src/orchestration/decide/index.ts`'s
 * `Decision.estimateSnapshot` actually writes there via
 * `structuredClone(prompt.basis)`) rather than `unknown`/a bare `Record` —
 * same "assume it's what our own adapters wrote" trust boundary this
 * file's header comment already documents for every other jsonb column
 * here, not a runtime-validated one (`decisions_estimate_snapshot_ok_shape`
 * validates its `status`/`value`/`evidenceState` shape at the database
 * level for an accepted/edited row, but not that `value` is truthful —
 * see that constraint's own comment).
 */
export interface DecisionRow {
  id: string;
  farm_id: string;
  prompt_id: string;
  calculation_kind: string;
  estimate_snapshot: EngineOutcome<unknown>;
  outcome: "accepted" | "edited" | "dismissed";
  edits: Record<string, unknown> | null;
  decided_by: "farmer";
  decided_at: string;
  field_id: string | null;
  calculation_version: string | null;
  inputs_snapshot: Record<string, unknown> | null;
  created_at: string;
}

/**
 * `20260829000000_orchestration_foundation.sql`'s `jobs` table. No
 * generic `target_type`/`target_id` columns — deliberately absent, see
 * that migration's own header comment and `BLOCKERS.md`'s "`jobs` has no
 * target-entity reference yet" entry (Vertical C's scope, not this one's).
 * `weight_observation_id` (`20260829020000_jobs_weight_observation_reference.sql`)
 * is a narrower, job-type-specific exception to that — see that
 * migration's own header comment for why it doesn't pre-empt Vertical C's
 * general design.
 */
export interface JobRow {
  id: string;
  farm_id: string;
  decision_id: string;
  job_type: string;
  status: "proposed" | "scheduled" | "in_progress" | "confirmed" | "dismissed";
  weight_observation_id: string | null;
  created_at: string;
  updated_at: string;
}
