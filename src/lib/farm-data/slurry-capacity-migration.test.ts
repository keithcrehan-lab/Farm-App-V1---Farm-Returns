import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSlurryAllocationPlanIssue } from "@/domain/slurry-allocation-plan";

/**
 * Static regression coverage for the slurry store-capacity invariant
 * (Codex audit MEDIUMs, audit-20260925T181932Z;
 * `20260925020000_slurry_allocations_store_capacity_invariant.sql`).
 *
 * These tests read the migration SQL — they do NOT execute it. No
 * PostgreSQL server, Docker or local Supabase stack is available to this
 * repository's test runner, so the trigger's locking, concurrency and RLS
 * behaviour remain unexecuted: real-Postgres integration coverage is
 * outstanding (see docs/farm-return-next/IMPLEMENTATION_LOG.md). What this
 * file guards is the shape of the fix — that the invariant sits on the
 * table (every write path), locks the store before summing, and that the
 * RPC no longer carries a second capacity algorithm.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");
const INVARIANT_FILE = "20260925020000_slurry_allocations_store_capacity_invariant.sql";

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function read(file: string): string {
  return stripComments(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
}

/** Body of the LAST `create or replace function public.<name>(` across all migrations, in apply order. */
function latestFunctionBody(name: string): { file: string; body: string } {
  let latest: { file: string; body: string } | undefined;
  for (const file of migrationFiles()) {
    const sql = read(file);
    const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "gi");
    for (const m of sql.matchAll(re)) latest = { file, body: m[1] };
  }
  if (!latest) throw new Error(`function ${name} not found`);
  return latest;
}

const invariantSql = read(INVARIANT_FILE);
const trigger = latestFunctionBody("slurry_allocations_enforce_store_capacity");
const rpc = latestFunctionBody("create_farmer_planned_slurry_allocation");

describe("slurry store-capacity invariant migration (static — SQL not executed)", () => {
  it("is ordered after the RPC migration it supersedes", () => {
    const files = migrationFiles();
    expect(files.indexOf(INVARIANT_FILE)).toBeGreaterThan(files.indexOf("20260925010000_create_farmer_planned_slurry_allocation_rpc.sql"));
    expect(trigger.file).toBe(INVARIANT_FILE);
    expect(rpc.file).toBe(INVARIANT_FILE);
  });

  it("attaches a row trigger to the table itself for INSERT and volume/store UPDATEs (covers direct writes)", () => {
    expect(invariantSql).toMatch(
      /create trigger slurry_allocations_store_capacity\s+before insert or update of volume_m3, housing_id on public\.slurry_allocations\s+for each row execute function public\.slurry_allocations_enforce_store_capacity\(\)/i,
    );
  });

  it("fires after the existing cross-farm integrity trigger (PostgreSQL fires same-timing triggers by name)", () => {
    expect("slurry_allocations_store_capacity" > "slurry_allocations_same_farm").toBe(true);
  });

  it("locks the destination store row, scoped to the allocation's farm, before summing its allocations", () => {
    const lockAt = trigger.body.search(/from public\.housing where id = new\.housing_id and farm_id = new\.farm_id for update/i);
    const sumAt = trigger.body.search(/sum\(volume_m3\)/i);
    expect(lockAt).toBeGreaterThan(-1);
    expect(sumAt).toBeGreaterThan(lockAt);
  });

  it("excludes the row being written from the store's existing total (volume increase / move)", () => {
    expect(trigger.body).toMatch(/where housing_id = new\.housing_id and id <> new\.id/i);
  });

  it("only skips UPDATEs that keep the store and do not increase volume", () => {
    expect(trigger.body).toMatch(/tg_op = 'UPDATE' and new\.housing_id = old\.housing_id and new\.volume_m3 <= old\.volume_m3/i);
  });

  it("rejects negative and non-finite volumes that would otherwise free capacity", () => {
    expect(trigger.body).toMatch(/new\.volume_m3 < 0/i);
    expect(trigger.body).toMatch(/'NaN'::double precision/i);
    expect(trigger.body).toMatch(/'-Infinity'::double precision/i);
  });

  it("refuses REPEATABLE READ, where a post-lock sum would read a stale snapshot", () => {
    expect(trigger.body).toMatch(/current_setting\('transaction_isolation'\) = 'repeatable read'/i);
  });

  it("runs as security invoker with a pinned search_path (RLS still applies to the caller)", () => {
    const header = invariantSql.slice(invariantSql.search(/create or replace function public\.slurry_allocations_enforce_store_capacity/i));
    expect(header.slice(0, 300)).toMatch(/security invoker\s+set search_path = pg_catalog, public/i);
    expect(invariantSql).not.toMatch(/security definer/i);
  });

  it("raises only issue codes the application already maps to farmer-facing copy", () => {
    const codes = [...trigger.body.matchAll(/slurry_allocation_plan_rejected:([A-Z_]+)/g)].map((m) => m[1]);
    expect(codes).toEqual(expect.arrayContaining(["VOLUME_INVALID", "STORE_NOT_FOUND", "VOLUME_EXCEEDS_AVAILABLE"]));
    for (const code of codes) expect(isSlurryAllocationPlanIssue(code)).toBe(true);
  });

  it("leaves the RPC with no capacity algorithm of its own — the trigger is the single implementation", () => {
    expect(rpc.body).not.toMatch(/sum\(/i);
    expect(rpc.body).not.toMatch(/storage_capacity_m3|storage_fill_pct/i);
    expect(rpc.body).toMatch(/insert into public\.slurry_allocations/i);
  });

  describe("store-volume reductions (housing side of the same invariant)", () => {
    const housingTrigger = latestFunctionBody("housing_enforce_store_volume_covers_allocations");

    it("attaches a BEFORE UPDATE trigger to housing for the two columns that define available volume", () => {
      expect(housingTrigger.file).toBe(INVARIANT_FILE);
      expect(invariantSql).toMatch(
        /create trigger housing_store_volume_covers_allocations\s+before update of storage_capacity_m3, storage_fill_pct on public\.housing\s+for each row execute function public\.housing_enforce_store_volume_covers_allocations\(\)/i,
      );
    });

    it("uses the allocation trigger's available-volume figure (capacity × fill% / 100, non-finite → 0)", () => {
      expect(housingTrigger.body).toMatch(/new_volume_m3 := new\.storage_capacity_m3 \* \(new\.storage_fill_pct \/ 100\)/i);
      expect(housingTrigger.body).toMatch(/old_volume_m3 := old\.storage_capacity_m3 \* \(old\.storage_fill_pct \/ 100\)/i);
      expect(housingTrigger.body).toMatch(/new_volume_m3 = 'NaN'::double precision[\s\S]*?new_volume_m3 := 0/i);
      // Non-finite normalisation must precede the skip: NaN >= x is true in PostgreSQL.
      expect(housingTrigger.body.search(/new_volume_m3 := 0/i)).toBeLessThan(housingTrigger.body.search(/if new_volume_m3 >= old_volume_m3/i));
    });

    it("only checks reductions, so re-saving an unchanged capacity/fill is never blocked", () => {
      expect(housingTrigger.body).toMatch(/if new_volume_m3 >= old_volume_m3 then\s+return new;/i);
    });

    it("locks the store row before summing its allocations and refuses REPEATABLE READ", () => {
      const lockAt = housingTrigger.body.search(/from public\.housing where id = old\.id for update/i);
      const sumAt = housingTrigger.body.search(/sum\(volume_m3\)/i);
      expect(lockAt).toBeGreaterThan(-1);
      expect(sumAt).toBeGreaterThan(lockAt);
      expect(housingTrigger.body).toMatch(/current_setting\('transaction_isolation'\) = 'repeatable read'/i);
    });

    it("rejects (never rewrites allocations) when the new volume is below the allocated total at 2 dp — an exact match is allowed", () => {
      expect(housingTrigger.body).toMatch(/if round\(\(new_volume_m3 - allocated_m3\)::numeric, 2\) < 0 then\s+raise exception 'housing_store_volume_below_allocated'/i);
      expect(housingTrigger.body).not.toMatch(/\b(update|delete)\s+(from\s+)?public\.slurry_allocations/i);
    });
  });

  it("does not alter existing grants, RLS policies or row data", () => {
    expect(invariantSql).not.toMatch(/(grant|revoke)[^;]*\bon (table )?public\.slurry_allocations(?!\w)/i);
    expect(invariantSql).not.toMatch(/policy/i);
    expect(invariantSql).not.toMatch(/^\s*(update|delete from|alter table)\b/im);
    expect(invariantSql).toMatch(/grant execute on function public\.create_farmer_planned_slurry_allocation\([^)]*\) to authenticated/i);
  });
});
