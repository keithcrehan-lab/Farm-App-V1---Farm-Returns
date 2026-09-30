# CC-B3 — lifecycle persistence design (migration not authorised)

Task `campaign-c-remaining-programme-20260930`. Status: **CC_B3_READY_FOR_MIGRATION_TASK**.
This is a design only. No migration was written or run, and no database schema changed.
CC-B3 remains DEFERRED until a separately authorised migration task exists (AGENTS.md:
forward-only migrations, never against production). It implements
[LIFECYCLE.md](LIFECYCLE.md) §6 (recommendation provenance) and §12 (the database / code
boundary).

## 1. Scope

The database holds only the append-only **recommendation / calculation records**. Rule
sets, claims and sources stay as repository artefacts, referenced by ID and fingerprint
(LIFECYCLE §12). No rule text or numeric parameter is copied into the database.

## 2. Table `scientific_calculation_records` (append-only)

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | no | calculation ID |
| `farm_id` | uuid FK `farms(id)` | no | farm boundary. RLS is by farm membership, the same pattern as existing farm tables |
| `field_id` | uuid FK `fields(id)` | yes | when field-scoped |
| `calculation_kind` | text CHECK in (`NUTRIENT_PLAN`, `SLURRY_RATE_ALLOCATION`, `SLURRY_DIRECT_ECONOMIC`, `SLURRY_WHOLE_FARM_ALLOCATION`) | no | which engine output |
| `engine_version` | text | no | e.g. `nutrient_engine_v1.2.0` |
| `module_versions` | jsonb | no | e.g. `{ "slurry_rate_allocation": "slurry_rate_allocation_v0.1.0-draft" }` |
| `scientific_rule_set_id` | text | no | e.g. `slurry-agronomy-ie-2026-v1` |
| `scientific_rule_set_fingerprint` | text | yes | null while the rule set is DRAFT with no fingerprint. It is never guessed |
| `regulatory_rule_set_id` | text | yes | Campaign B base (`nitrates-ie-2026-v1` when registered) |
| `applied_override_ids` | text[] | no, default `{}` | LIFECYCLE §5 |
| `economic_rule_set_id` | text | yes | — |
| `source_version_ids` | text[] | no | union used |
| `claim_ids` | text[] | no | e.g. `CLM-TGC-OM-AVAIL`, `CLM-TGC-OM-SHARE-P` |
| `scientific_classification` | text CHECK in (`REPOSITORY_VERIFIED`, `AI_PROVISIONAL`, `AI_REVIEW_ONLY`, `MIXED`) | no | strongest-to-weakest summary. Per-rule detail is in `outputs` |
| `rule_set_status` | text CHECK in (`DRAFT`, `APPROVED`, `ACTIVE`, `RETIRED`, `SUPERSEDED`) | no | status at calculation time |
| `validation_status` | text CHECK in (`EXPERT_VALIDATION_PENDING`, `EXPERT_VALIDATED`, `NOT_APPLICABLE`) | no | Campaign C today: `EXPERT_VALIDATION_PENDING` |
| `inputs` | jsonb | no | `[{ name, value, evidenceClass, recordId?, recordedAt? }]`, holding input provenance (soil index provenance, DM status, method, date) |
| `evidence_snapshot` | jsonb | no | `{ sourcePackage, manifestSha256s }`, for example the `external_teagasc_2026-09-29` fingerprints |
| `outputs` | jsonb | no | the immutable historical result: the full engine outcome, including every constraint record with `binding` and `deferral` |
| `decision_status` | text CHECK in (`OK`, `BLOCKED_INSUFFICIENT_EVIDENCE`, `AMBIGUOUS`, `NOT_APPLICABLE`, `LEGAL_PROHIBITION`, `UNKNOWN`) | no | top-level `EngineOutcome` status |
| `governing_date` | date | no | LIFECYCLE §10 (generation date for science, planned date for regulation) |
| `planning_date` | date | yes | planned application date |
| `calculated_at` | timestamptz default `now()` | no | server-stamped |
| `integrity_fingerprint` | text | no | `computeAssessmentFingerprint` (`assessment-integrity.ts`) over every column above except `id` and `calculated_at` |
| `integrity_schema_version` | int | no | `ASSESSMENT_INTEGRITY_SCHEMA_VERSION` |
| `supersedes_record_id` | uuid FK self | yes | set on the **new** record. The old record is never edited |

Constraints:

- **No UPDATE or DELETE.** Revoke both from `authenticated`. A trigger raises on UPDATE
  or DELETE, following the precedent of the existing lifecycle tables.
- **Supersession is derived**: `superseded_by` is a view or query over
  `supersedes_record_id`, never a mutable column.
- A `supersedes_record_id` must reference a row with the same `farm_id`. This is
  enforced in the insert RPC.
- Inserts go only through a `security definer` RPC. The RPC binds `farm_id` server-side
  and checks the integrity fingerprint shape.

Indexes: `(farm_id, field_id, calculated_at desc)`, `(engine_version)` and
`(scientific_rule_set_id)`. The last two support LIFECYCLE §8 affected-record queries,
for example `engine_version = 'nutrient_engine_v1.1.0'`.

## 3. Read rules

- An old record displays its stored `outputs`. It is never recomputed (LIFECYCLE §6).
- A "newer guidance exists" comparison is a separate, labelled computation. It is never
  written back.

## 4. Migration task checklist (for the authorised task)

1. Write a forward-only migration under `supabase/migrations/` that creates the table,
   the RLS policies, the revokes, the trigger and the RPC. Include no backfill: no
   historical outputs exist to reconstruct, and inventing them is forbidden.
2. Write a `src/lib/farm-data/` mapper plus runtime validation on read. Follow the
   `isEvidenceState` precedent and never trust jsonb shape.
3. Tests: RLS cross-farm denial, UPDATE/DELETE rejection, fingerprint round-trip,
   supersession, and unknown-not-zero in `inputs`.
4. Apply the migration to Dev only (`Farm Return V1 Dev`), never production.

## 5. Specification tests available now

No persistence code exists. The fields above map one-to-one onto values already produced
in code:

- `NUTRIENT_ENGINE_VERSION`
- `SLURRY_RATE_ALLOCATION_VERSION`
- the constraint records' `ruleId`, `sourceClaimIds` and `evidenceClass`
- `computeAssessmentFingerprint`

`src/domain/slurry-rate-allocation.test.ts` pins those producer-side fields.
