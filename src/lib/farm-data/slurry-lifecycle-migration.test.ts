import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSlurryAllocationLifecycleIssue } from "@/domain/slurry-allocation-lifecycle";

/**
 * Static regression coverage for Phase 1A
 * (`20260926000000_slurry_allocation_lifecycle.sql`).
 *
 * These tests read the migration SQL — they do NOT execute it. No
 * PostgreSQL server, Docker or local Supabase stack is available to this
 * repository's test runner, so trigger firing, row locking, concurrent
 * create/edit/complete/cancel races, RLS and cross-farm refusal remain
 * unexecuted: real-Postgres integration coverage is outstanding
 * (docs/farm-return-next/SLURRY_ALLOCATION_LIFECYCLE.md § Validation).
 */

const FILE = "20260926000000_slurry_allocation_lifecycle.sql";
const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations", FILE), "utf8").replace(/--[^\n]*/g, "");

function body(name: string): string {
  const m = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "i"));
  if (!m) throw new Error(`function ${name} not found`);
  return m[1];
}

const observation = body("housing_track_store_observation");
const storeVolume = body("housing_enforce_store_volume_covers_allocations");
const capacity = body("slurry_allocations_enforce_store_capacity");
const recordObservation = body("record_slurry_store_observation");
const completeRpc = body("complete_planned_slurry_allocation");
const cancelRpc = body("cancel_planned_slurry_allocation");
const updateRpc = body("update_planned_slurry_allocation");
const history = body("slurry_allocations_protect_lifecycle_history");

describe("Phase 1A lifecycle migration (static — SQL not executed)", () => {
  describe("store observation identity is database-owned", () => {
    it("starts a new observation only for a freshly-stamped farmer-recorded reading", () => {
      expect(observation).toMatch(
        /if new\.storage_fill_status = 'farmer_recorded'\s+and new\.storage_fill_recorded_at is not null\s+and new\.storage_fill_recorded_at is distinct from old\.storage_fill_recorded_at then\s+new\.store_observation_seq := old\.store_observation_seq \+ 1;\s+new\.store_observed_at := clock_timestamp\(\);/i,
      );
    });

    it("never reads the written identity columns — a direct seq/observed_at write cannot manufacture a baseline", () => {
      expect(observation).not.toMatch(/new\.store_observation_seq\s+(is|=|<>|>|<)/i);
      expect(observation).not.toMatch(/new\.store_observed_at\s+(is|=|<>|>|<)/i);
      expect(observation).toMatch(/else\s+new\.store_observation_seq := old\.store_observation_seq;\s+new\.store_observed_at := old\.store_observed_at;/i);
      for (const m of observation.matchAll(/new\.store_observation_seq := ([^;]+);/gi)) {
        expect(m[1]).toMatch(/^(1|old\.store_observation_seq( \+ 1)?)$/i);
      }
    });

    it("a fill-percentage change alone (e.g. an 'estimated' correction) is not an observation", () => {
      expect(observation).not.toMatch(/storage_fill_pct/i);
    });

    it("the canonical observation RPC stamps a new reading and never writes the identity columns", () => {
      expect(recordObservation).toMatch(/storage_fill_status = 'farmer_recorded'/i);
      expect(recordObservation).toMatch(/storage_fill_recorded_at = clock_timestamp\(\)/i);
      expect(recordObservation).not.toMatch(/store_observation_seq|store_observed_at/i);
      expect(recordObservation).toMatch(/where id = p_housing_id and farm_id = p_farm_id/i);
    });

    it("fires on every insert/update, before the store-volume check (name order)", () => {
      expect(sql).toMatch(/create trigger housing_store_observation\s+before insert or update on public\.housing/i);
      expect("housing_store_observation" < "housing_store_volume_covers_allocations").toBe(true);
    });

    it("checks store-volume changes on every housing UPDATE, not a column list a timestamp-only write could miss", () => {
      expect(sql).toMatch(/create trigger housing_store_volume_covers_allocations\s+before update on public\.housing\s+for each row/i);
    });
  });

  describe("store-volume reductions (R)", () => {
    it("compares reconciled volumes (observed − withdrawn against each observation) and rejects below active reservations", () => {
      expect(storeVolume).toMatch(/old_reconciled_m3 := old_observed_m3 - public\.slurry_store_withdrawn_since_observation_m3\(old\.id, old\.store_observation_seq\)/i);
      expect(storeVolume).toMatch(/withdrawn_m3 := public\.slurry_store_withdrawn_since_observation_m3\(old\.id, new\.store_observation_seq\)/i);
      expect(storeVolume).toMatch(/reserved_m3 := public\.slurry_store_active_reserved_m3\(old\.id, null\)/i);
      expect(storeVolume).toMatch(/raise exception 'housing_store_volume_below_allocated'/i);
    });

    it("never cancels, shrinks or deletes allocations to make an observation fit", () => {
      expect(storeVolume).not.toMatch(/\b(update|delete)\s+(from\s+)?public\.slurry_allocations/i);
    });

    it("locks the store before summing and refuses REPEATABLE READ", () => {
      expect(storeVolume.search(/for update/i)).toBeLessThan(storeVolume.search(/slurry_store_active_reserved_m3/i));
      expect(storeVolume).toMatch(/current_setting\('transaction_isolation'\) = 'repeatable read'/i);
    });
  });

  describe("active reservations and withdrawals", () => {
    it("S. only 'planned' rows reserve capacity", () => {
      expect(body("slurry_store_active_reserved_m3")).toMatch(/and status = 'planned'/i);
    });

    it("H. only completions withdrawn after the CURRENT observation reduce the store", () => {
      const withdrawn = body("slurry_store_withdrawn_since_observation_m3");
      expect(withdrawn).toMatch(/sum\(actual_volume_m3\)/i);
      expect(withdrawn).toMatch(/status = 'completed'\s+and store_reconciliation = 'withdrawn_after_observation'\s+and store_observation_seq = p_observation_seq/i);
    });

    it("indexes the active-reservation and withdrawal sums", () => {
      expect(sql).toMatch(/create index slurry_allocations_active_reservations_idx\s+on public\.slurry_allocations \(housing_id\) where status = 'planned'/i);
      expect(sql).toMatch(/create index slurry_allocations_store_withdrawals_idx\s+on public\.slurry_allocations \(housing_id, store_observation_seq\) where status = 'completed'/i);
    });
  });

  describe("allocation trigger — every write path (N)", () => {
    it("fires on every INSERT and UPDATE of the table, not only volume/store columns", () => {
      expect(sql).toMatch(/create trigger slurry_allocations_store_capacity\s+before insert or update on public\.slurry_allocations\s+for each row/i);
    });

    it("inserts must be planned; completed/cancelled rows are immutable (L, M)", () => {
      expect(capacity).toMatch(/if new\.status is distinct from 'planned' then\s+raise exception 'slurry_allocation_lifecycle_rejected:NOT_PLANNED'/i);
      expect(capacity).toMatch(/if old\.status <> 'planned' then\s+raise exception 'slurry_allocation_lifecycle_rejected:NOT_PLANNED'/i);
    });

    it("a completion/cancellation cannot also change the plan, and lifecycle stamps are database-owned", () => {
      expect(capacity).toMatch(/TRANSITION_CHANGES_PLAN/);
      expect(capacity).toMatch(/new\.cancelled_at := clock_timestamp\(\);\s+new\.cancelled_by := auth\.uid\(\);/i);
      expect(capacity).toMatch(/new\.completed_at := clock_timestamp\(\);\s+new\.completed_by := auth\.uid\(\);/i);
      expect(capacity).toMatch(/new\.store_observation_seq := store\.store_observation_seq;/i);
    });

    it("J/P. consumption (insert, increase, move, withdrawn completion) is checked under the store lock against reconciled − other reservations", () => {
      const lockAt = capacity.search(/from public\.housing where id = new\.housing_id and farm_id = new\.farm_id for update/i);
      expect(lockAt).toBeGreaterThan(-1);
      expect(capacity.search(/slurry_store_active_reserved_m3\(store\.id, new\.id\)/i)).toBeGreaterThan(lockAt);
      expect(capacity).toMatch(/consumed_m3 := case when new\.store_reconciliation = 'withdrawn_after_observation' then new\.actual_volume_m3 end/i);
      expect(capacity).toMatch(/if new\.housing_id = old\.housing_id and new\.volume_m3 <= old\.volume_m3 then\s+return new;/i);
    });

    it("rejects invalid planned and actual volumes", () => {
      expect(capacity).toMatch(/new\.volume_m3 < 0/i);
      expect(capacity).toMatch(/new\.actual_volume_m3 <= 0/i);
    });
  });

  describe("lifecycle constraint", () => {
    it("ties every lifecycle column to its state", () => {
      expect(sql).toMatch(/add constraint slurry_allocations_lifecycle_valid check/i);
      expect(sql).toMatch(/status = 'planned'\s+and actual_volume_m3 is null/i);
      expect(sql).toMatch(/status = 'completed'\s+and actual_volume_m3 is not null and actual_volume_m3 > 0/i);
      expect(sql).toMatch(/status = 'cancelled'\s+and cancelled_at is not null/i);
    });

    it("existing rows become 'planned' — no history is invented", () => {
      expect(sql).toMatch(/add column status text not null default 'planned'/i);
      // Every row write is a single-row RPC update — no backfill of existing rows.
      const updates = [...sql.matchAll(/update public\.slurry_allocations[^;]*;/gi)].map((m) => m[0]);
      expect(updates.length).toBe(3);
      for (const u of updates) expect(u).toMatch(/where id = p_allocation_id/i);
    });

    it("one ACTIVE plan per field/store; history rows do not block re-planning", () => {
      expect(sql).toMatch(/drop constraint slurry_allocations_field_id_housing_id_key/i);
      expect(sql).toMatch(/create unique index slurry_allocations_one_plan_per_field_store\s+on public\.slurry_allocations \(field_id, housing_id\) where status = 'planned'/i);
    });

    it("F. completed/cancelled rows cannot be deleted directly", () => {
      expect(history).toMatch(/if old\.status = 'planned' then\s+return old;/i);
      expect(history).toMatch(/HISTORY_PROTECTED/);
      expect(sql).toMatch(/create trigger slurry_allocations_lifecycle_history\s+before delete on public\.slurry_allocations/i);
    });
  });

  describe("RPCs", () => {
    it("O. every lifecycle RPC locks the allocation scoped to the caller's farm", () => {
      for (const rpc of [updateRpc, cancelRpc, completeRpc]) {
        expect(rpc).toMatch(/from public\.slurry_allocations where id = p_allocation_id and farm_id = p_farm_id for update/i);
      }
      expect(updateRpc).toMatch(/from public\.fields where id = p_field_id and farm_id = p_farm_id and archived_at is null/i);
      expect(updateRpc).toMatch(/from public\.housing where id = p_housing_id and farm_id = p_farm_id/i);
    });

    it("cancellation is idempotent and never creates an actual", () => {
      expect(cancelRpc).toMatch(/if current_row\.status = 'cancelled' then\s+return current_row;/i);
      expect(cancelRpc).not.toMatch(/actual_volume_m3/i);
    });

    it("K. a second completion is refused, never re-consumed", () => {
      expect(completeRpc).toMatch(/if current_row\.status = 'completed' then\s+raise exception 'slurry_allocation_lifecycle_rejected:ALREADY_COMPLETED'/i);
    });

    it("an ambiguous spread date requires the caller to state the reconciliation", () => {
      expect(completeRpc).toMatch(/if allowed_reconciliation = 'ambiguous' then\s+raise exception 'slurry_allocation_lifecycle_rejected:RECONCILIATION_REQUIRED'/i);
    });

    it("carry no capacity arithmetic of their own — the triggers are the single implementation", () => {
      for (const rpc of [updateRpc, cancelRpc, completeRpc, recordObservation]) expect(rpc).not.toMatch(/sum\(/i);
    });

    it("every function is security invoker with a pinned search_path; no security definer; no anon execute", () => {
      expect(sql).not.toMatch(/security definer/i);
      const headers = [...sql.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\$\$/gi)];
      expect(headers.length).toBeGreaterThanOrEqual(12);
      for (const h of headers) expect(h[0]).toMatch(/set search_path = pg_catalog, public/i);
      for (const h of headers) expect(sql).toMatch(new RegExp(`revoke all on function public\\.${h[1]}\\([^)]*\\) from public, anon`, "i"));
    });

    it("raises only issue codes the application maps to farmer-facing copy", () => {
      const codes = [...sql.matchAll(/slurry_(?:allocation_lifecycle|allocation_plan|store_observation)_rejected:([A-Z_]+)/g)].map((m) => m[1]);
      expect(codes.length).toBeGreaterThan(10);
      for (const code of codes) expect(isSlurryAllocationLifecycleIssue(code)).toBe(true);
    });
  });

  it("does not alter RLS policies or table grants", () => {
    expect(sql).not.toMatch(/policy/i);
    expect(sql).not.toMatch(/(grant|revoke)[^;]*\bon (table )?public\.(slurry_allocations|housing)(?!\w)/i);
  });
});
