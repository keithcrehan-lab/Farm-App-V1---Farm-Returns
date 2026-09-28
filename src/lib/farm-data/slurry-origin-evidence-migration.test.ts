import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static regression coverage for
 * `20260928000000_slurry_allocation_origin_evidence.sql`.
 *
 * These tests read the migration SQL — they do NOT execute it. No
 * PostgreSQL server, Docker or local Supabase stack is available to this
 * repository's test runner, so the constraints, RLS policies, grants and
 * triggers remain unexecuted. The migration has NOT been applied to
 * `Farm Return V1 Dev`.
 */

const FILE = "20260928000000_slurry_allocation_origin_evidence.sql";
const raw = readFileSync(path.resolve(__dirname, "../../../supabase/migrations", FILE), "utf8");
const sql = raw.replace(/--[^\n]*/g, "");
const T = "slurry_allocation_origin_evidence_records";

const table = sql.match(new RegExp(`create table public\\.${T} \\(([\\s\\S]*?)\\n\\);`, "i"))?.[1] ?? "";
const fnBody = (name: string) => sql.match(new RegExp(`function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "i"))?.[1] ?? "";
const revisionFn = fnBody("slurry_allocations_track_plan_revision");
const stampFn = fnBody("slurry_allocation_origin_evidence_stamp_allocation");

describe("Slurry-origin evidence migration (static — SQL not executed)", () => {
  it("is additive and forward-only: no drop, no data rewrite, no origin backfill", () => {
    expect(table).not.toBe("");
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy|function|trigger|constraint)\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    // The only change to an existing table is the one new, defaulted column.
    expect(sql.match(/alter table public\.slurry_allocations\b/gi)?.length).toBe(1);
    expect(sql).toMatch(/alter table public\.slurry_allocations\s+add column plan_revision bigint not null default 1 check \(plan_revision >= 1\);/i);
    expect(raw).toMatch(/NOT YET APPLIED to `Farm Return V1 Dev`/);
  });

  it("origin has no default and only the four declared values; status is only farmer_adjusted/verified", () => {
    expect(table).toMatch(/origin text not null check \(origin in \('home_produced_grazing_livestock', 'imported_organic_manure', 'mixed', 'unknown'\)\)/i);
    expect(table).not.toMatch(/origin text[^,]*default/i);
    expect(table).toMatch(/status text not null check \(status in \('farmer_adjusted', 'verified'\)\)/i);
    expect(table).toMatch(/source text not null check \(length\(btrim\(source\)\) > 0\)/i);
  });

  it("the subject is the allocation (never the store) with a full snapshot", () => {
    expect(table).toMatch(/allocation_id uuid not null references public\.slurry_allocations \(id\)/i);
    expect(table).toMatch(/plan_revision_at_record bigint not null/i);
    expect(table).toMatch(/field_id_at_record uuid not null/i);
    expect(table).toMatch(/housing_id_at_record uuid not null/i);
    expect(table).toMatch(/volume_m3_at_record double precision not null/i);
    expect(table).not.toMatch(/references public\.housing/i);
  });

  it("plan_revision is database-owned: 1 on insert, bumped on field/store/volume change, pinned otherwise", () => {
    expect(revisionFn).toMatch(/if tg_op = 'INSERT' then\s+new\.plan_revision := 1;/i);
    expect(revisionFn).toMatch(
      /new\.field_id is distinct from old\.field_id\s+or new\.housing_id is distinct from old\.housing_id\s+or new\.volume_m3 is distinct from old\.volume_m3 then\s+new\.plan_revision := old\.plan_revision \+ 1;/i,
    );
    expect(revisionFn).toMatch(/else\s+new\.plan_revision := old\.plan_revision;/i);
    expect(sql).toMatch(/before insert or update on public\.slurry_allocations\s+for each row execute function public\.slurry_allocations_track_plan_revision\(\)/i);
  });

  it("a declaration is refused unless the plan is planned and still at the revision the client saw; the snapshot is stamped, never client-owned", () => {
    expect(stampFn).toMatch(/where a\.id = new\.allocation_id and a\.farm_id = new\.farm_id\s+for share;/i);
    expect(stampFn).toMatch(/raise exception 'slurry_origin_evidence_rejected:ALLOCATION_NOT_FOUND'/i);
    expect(stampFn).toMatch(/if alloc\.status <> 'planned' then\s+raise exception 'slurry_origin_evidence_rejected:NOT_PLANNED'/i);
    expect(stampFn).toMatch(/if new\.plan_revision_at_record is distinct from alloc\.plan_revision then\s+raise exception 'slurry_origin_evidence_rejected:PLAN_CHANGED'/i);
    expect(stampFn).toMatch(/new\.field_id_at_record := alloc\.field_id;/i);
    expect(stampFn).toMatch(/new\.housing_id_at_record := alloc\.housing_id;/i);
    expect(stampFn).toMatch(/new\.volume_m3_at_record := alloc\.volume_m3;/i);
    expect(stampFn).not.toMatch(/new\.origin :=/i);
    expect(sql).toMatch(new RegExp(`before insert on public\\.${T}\\s+for each row execute function public\\.slurry_allocation_origin_evidence_stamp_allocation\\(\\)`, "i"));
  });

  it("capture provenance reuses the database-owned Campaign B stamp", () => {
    expect(sql).toMatch(new RegExp(`before insert on public\\.${T}\\s+for each row execute function public\\.regulatory_evidence_records_stamp_capture\\(\\)`, "i"));
    expect(sql).not.toMatch(/create or replace function public\.regulatory_evidence_records_stamp_capture/i);
  });

  it("RLS on, owner read/insert only, no update/delete, revoke before grant", () => {
    expect(sql).toMatch(new RegExp(`alter table public\\.${T} enable row level security`, "i"));
    expect(sql).toMatch(new RegExp(`"${T}_owner_read" on public\\.${T}\\s+for select\\s+to authenticated`, "i"));
    expect(sql).toMatch(new RegExp(`"${T}_owner_insert" on public\\.${T}\\s+for insert\\s+to authenticated`, "i"));
    expect(sql).not.toMatch(new RegExp(`on public\\.${T}\\s+for (update|delete|all)`, "i"));
    expect(sql).toMatch(new RegExp(`a\\.id = ${T}\\.allocation_id\\s+and a\\.farm_id = ${T}\\.farm_id`, "i"));
    const revoke = sql.search(new RegExp(`revoke all on public\\.${T} from anon, authenticated;`, "i"));
    const grant = sql.search(new RegExp(`grant select, insert on public\\.${T} to authenticated;`, "i"));
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
    for (const fn of ["slurry_allocations_track_plan_revision", "slurry_allocation_origin_evidence_stamp_allocation"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon;`, "i"));
    }
    expect(sql.match(/security invoker\s+set search_path = pg_catalog, public/gi)?.length).toBe(2);
  });
});
