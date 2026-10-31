import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "20261031121137_grazing_field_movements.sql";
const raw = readFileSync(path.resolve(__dirname, "../../../supabase/migrations", FILE), "utf8");
const sql = raw.replace(/--[^\n]*/g, "");

describe("grazing field movement migration", () => {
  it("stores dated sessions with immutable grazing-pressure snapshots", () => {
    expect(sql).toMatch(/create table public\.grazing_field_sessions/i);
    expect(sql).toMatch(/head_count_snapshot numeric not null check \(head_count_snapshot > 0\)/i);
    expect(sql).toMatch(/livestock_units_per_head_snapshot numeric not null check \(livestock_units_per_head_snapshot > 0\)/i);
    expect(sql).toMatch(/livestock_category_snapshot text not null/i);
    expect(sql).toMatch(/ended_at is null or ended_at > started_at/i);
  });

  it("allows only one open field session per livestock group", () => {
    expect(sql).toMatch(/create unique index grazing_field_sessions_one_open_per_group_idx[\s\S]*on public\.grazing_field_sessions\(livestock_group_id\)[\s\S]*where ended_at is null/i);
  });

  it("keeps the table owner-scoped with RLS and no delete grant", () => {
    expect(sql).toMatch(/alter table public\.grazing_field_sessions enable row level security/i);
    expect(sql).toMatch(/grazing_field_sessions_owner_select[\s\S]*for select[\s\S]*to authenticated/i);
    expect(sql).toMatch(/grazing_field_sessions_owner_insert[\s\S]*for insert[\s\S]*to authenticated/i);
    expect(sql).toMatch(/grazing_field_sessions_owner_update[\s\S]*for update[\s\S]*to authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.grazing_field_sessions from anon, authenticated/i);
    expect(sql).toMatch(/grant select, insert, update on table public\.grazing_field_sessions to authenticated/i);
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*grazing_field_sessions/i);
  });

  it("the move RPC is security-invoker, validates same-farm ownership and closes the old session before opening the new one", () => {
    expect(sql).toMatch(/function public\.record_grazing_field_move/i);
    expect(sql).toMatch(/security invoker\s+set search_path = ''/i);
    expect(sql).toMatch(/g\.id = p_livestock_group_id[\s\S]*f\.user_id = \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/fld\.id = p_field_id[\s\S]*fld\.farm_id = v_group\.farm_id[\s\S]*f\.user_id = \(select auth\.uid\(\)\)/i);
    const closeAt = sql.search(/update public\.grazing_field_sessions\s+set ended_at = p_started_at/i);
    const insertAt = sql.search(/insert into public\.grazing_field_sessions/i);
    expect(closeAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(closeAt);
  });

  it("snapshots the same LU factors used by Farm Return and moves the group out of housing", () => {
    expect(sql).toMatch(/when 'suckler_cow' then 0\.9/i);
    expect(sql).toMatch(/when 'calf' then 0\.3/i);
    expect(sql).toMatch(/when 'steer' then 0\.7/i);
    expect(sql).toMatch(/update public\.livestock_groups\s+set system = 'grazing', housing_id = null/i);
  });

  it("does not expose the movement RPC to public or anon", () => {
    expect(sql).toMatch(/revoke execute on function public\.record_grazing_field_move\(uuid, uuid, timestamptz, text\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.record_grazing_field_move\(uuid, uuid, timestamptz, text\) to authenticated/i);
  });
});
