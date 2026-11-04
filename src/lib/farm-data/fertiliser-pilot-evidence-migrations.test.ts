import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static regression coverage for the Codex audit F003/F010 migrations.
 *
 * These tests read the migration SQL — they do NOT execute it. No
 * PostgreSQL server is available to this repository's test runner, so the
 * constraints, RLS policies, grants and triggers remain unexecuted. Neither
 * migration has been applied to `Farm Return V1 Dev`.
 */
const read = (file: string) => {
  const raw = readFileSync(path.resolve(__dirname, "../../../supabase/migrations", file), "utf8");
  return raw.replace(/--[^\n]*/g, "");
};

describe("F003: farm_preceding_year_gsr_records (static — SQL not executed)", () => {
  const sql = read("20261103122536_preceding_year_gsr_evidence_records.sql");
  const T = "farm_preceding_year_gsr_records";

  it("is additive and forward-only: a new table, no drop, rewrite or backfill", () => {
    expect(sql).toMatch(new RegExp(`create table public\\.${T} \\(`, "i"));
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy|function|trigger|constraint)\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/alter table public\.farms\b/i);
  });

  it("enables RLS with owner-scoped select and insert only — no update/delete grant or policy, no SECURITY DEFINER", () => {
    expect(sql).toMatch(new RegExp(`alter table public\\.${T} enable row level security`, "i"));
    expect(sql).toMatch(new RegExp(`revoke all on public\\.${T} from anon, authenticated;`, "i"));
    expect(sql).toMatch(new RegExp(`grant select, insert on public\\.${T} to authenticated;`, "i"));
    expect(sql.match(/create policy/gi)?.length).toBe(2);
    expect(sql).toMatch(/for select\s+to authenticated\s+using \(exists \(select 1 from public\.farms f where f\.id = farm_id and f\.user_id = \(select auth\.uid\(\)\)\)\)/i);
    expect(sql).toMatch(/for insert\s+to authenticated\s+with check \(exists \(select 1 from public\.farms f where f\.id = farm_id and f\.user_id = \(select auth\.uid\(\)\)\)\)/i);
    expect(sql).not.toMatch(/for (update|delete|all)\b/i);
    expect(sql).not.toMatch(/grant[^;]*\b(update|delete)\b/i);
    expect(sql).not.toMatch(/security definer/i);
  });

  it("capture provenance is database-stamped by the shared security-invoker trigger", () => {
    expect(sql).toMatch(new RegExp(`before insert on public\\.${T}\\s+for each row execute function public\\.regulatory_evidence_records_stamp_capture\\(\\);`, "i"));
    expect(sql).toMatch(/status text not null check \(status in \('farmer_adjusted', 'verified'\)\)/i);
    expect(sql).toMatch(/source text not null check \(length\(btrim\(source\)\) > 0\)/i);
  });
});

describe("F010: slurry_forecast_adoptions system-forecast binding (static — SQL not executed)", () => {
  const sql = read("20261103122537_slurry_forecast_adoption_system_binding.sql");

  it("adds nullable snapshot columns and a NOT VALID constraint — no existing row is rewritten or rejected", () => {
    expect(sql).toMatch(/add column system_forecast_version text,/i);
    expect(sql).toMatch(/add column system_forecast_assessed_on date,/i);
    expect(sql).toMatch(/add column system_forecast_stores jsonb/i);
    expect(sql).toMatch(/forecast_source is distinct from 'SYSTEM_FORECAST'[\s\S]*\) not valid;/i);
    expect(sql).not.toMatch(/\bdrop\b|\bupdate\s+public\.|\bdelete\s+from\b|\bgrant\b|security definer/i);
  });
});

describe("F010: slurry_forecast_adoptions server-only SYSTEM_FORECAST write boundary (static — SQL not executed)", () => {
  const sql = read("20261103135703_slurry_forecast_adoption_server_write_boundary.sql");

  it("forbids authenticated from inserting any SYSTEM_FORECAST row or system-forecast column via a RESTRICTIVE policy", () => {
    expect(sql).toMatch(
      /as restrictive\s+for insert\s+to authenticated\s+with check \(\s*forecast_source is distinct from 'SYSTEM_FORECAST'\s+and system_forecast_binding is null\s+and system_forecast_version is null\s+and system_forecast_assessed_on is null\s+and system_forecast_stores is null\s*\);/i,
    );
  });

  it("adds a nullable SERVER_BOUND marker and a NOT VALID constraint requiring it on SYSTEM_FORECAST adoptions", () => {
    expect(sql).toMatch(/add column system_forecast_binding text\s+check \(system_forecast_binding is null or system_forecast_binding = 'SERVER_BOUND'\)/i);
    expect(sql).toMatch(/or system_forecast_binding = 'SERVER_BOUND'\s*\) not valid;/i);
  });

  it("narrows service_role to select + insert; grants nothing new to authenticated; no SECURITY DEFINER, drop, update or delete", () => {
    expect(sql).toMatch(/revoke all on table public\.slurry_forecast_adoptions from service_role;/i);
    expect(sql).toMatch(/grant select, insert on table public\.slurry_forecast_adoptions to service_role;/i);
    expect(sql).not.toMatch(/grant[^;]*to (authenticated|anon)/i);
    expect(sql).not.toMatch(/security definer|\bdrop\b|\bupdate\s+public\.|\bdelete\s+from\b|\bfor (update|delete|all)\b/i);
  });
});

describe("F003: farm_preceding_year_gsr_records database record order (static — SQL not executed)", () => {
  const sql = read("20261103135704_preceding_year_gsr_record_order.sql");

  it("adds a nullable column with no default — existing rows are not rewritten or given a made-up order", () => {
    expect(sql).toMatch(/add column record_order bigint;/i);
    expect(sql).not.toMatch(/record_order bigint[^;]*default/i);
    expect(sql).toMatch(/create unique index farm_preceding_year_gsr_records_record_order_key\s+on public\.farm_preceding_year_gsr_records \(record_order\);/i);
  });

  it("a security-invoker BEFORE INSERT trigger always assigns the order from the sequence, overriding any client value", () => {
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toMatch(/new\.record_order := nextval\('public\.farm_preceding_year_gsr_records_record_order_seq'\);/i);
    expect(sql).toMatch(/before insert on public\.farm_preceding_year_gsr_records\s+for each row execute function public\.farm_preceding_year_gsr_records_stamp_order\(\);/i);
  });

  it("grants only sequence USAGE to authenticated; table grants and policies unchanged; no SECURITY DEFINER, drop or rewrite", () => {
    expect(sql).toMatch(/revoke all on sequence public\.farm_preceding_year_gsr_records_record_order_seq from public, anon, authenticated;/i);
    expect(sql).toMatch(/grant usage on sequence public\.farm_preceding_year_gsr_records_record_order_seq to authenticated;/i);
    expect(sql).not.toMatch(/grant[^;]*on (table )?public\.farm_preceding_year_gsr_records\b/i);
    expect(sql).not.toMatch(/create policy|security definer|\bdrop\b|\bupdate\s+public\.|\bdelete\s+from\b/i);
  });
});
