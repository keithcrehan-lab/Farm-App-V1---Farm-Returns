import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "20261105120000_cattle_housing_move_and_identity_corrections.sql";
const raw = readFileSync(path.resolve(__dirname, "../../../supabase/migrations", FILE), "utf8");
const sql = raw.replace(/--[^\n]*/g, "");
const fn = sql.slice(sql.search(/function public\.record_group_housing_move/i), sql.search(/revoke execute on function public\.record_group_housing_move/i));

describe("cattle housing move + identity corrections migration", () => {
  it("is additive and forward-only: no drop, truncate or delete", () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("the housing move RPC is security-invoker and checks group and shed are the caller's same farm", () => {
    expect(fn).toMatch(/security invoker\s+set search_path = ''/i);
    expect(fn).toMatch(/g\.id = p_livestock_group_id[\s\S]*f\.user_id = \(select auth\.uid\(\)\)[\s\S]*for update of g/i);
    expect(fn).toMatch(/h\.id = p_housing_id[\s\S]*h\.farm_id = v_group\.farm_id[\s\S]*f\.user_id = \(select auth\.uid\(\)\)/i);
    expect(fn).toMatch(/housing_move_rejected:GROUP_NOT_FOUND/);
    expect(fn).toMatch(/housing_move_rejected:HOUSING_NOT_FOUND/);
    expect(fn).toMatch(/housing_move_rejected:INVALID_HOUSED_AT/);
  });

  it("closes ONLY the open grazing session, at the housing date, before setting the group housed + shed", () => {
    expect(fn).toMatch(/s\.livestock_group_id = v_group\.id\s+and s\.ended_at is null\s+for update/i);
    const close = fn.search(/update public\.grazing_field_sessions\s+set ended_at = p_housed_at\s+where id = v_open\.id/i);
    const house = fn.search(/update public\.livestock_groups\s+set system = 'housed', housing_id = v_housing\.id/i);
    expect(close).toBeGreaterThan(-1);
    expect(house).toBeGreaterThan(close);
    // Closed (historical) sessions are never touched: the only session update is the open one, by id.
    expect(fn.match(/update public\.grazing_field_sessions/gi)).toHaveLength(1);
    expect(fn).toMatch(/housing_move_rejected:MOVE_NOT_AFTER_CURRENT_START/);
  });

  it("a repeated move into the same shed with no open session changes nothing", () => {
    expect(fn).toMatch(/if not v_has_open and v_group\.system = 'housed' and v_group\.housing_id = v_housing\.id then\s+return query select null::uuid, null::uuid, false/i);
  });

  it("does not expose the housing RPC to public or anon", () => {
    expect(sql).toMatch(/revoke execute on function public\.record_group_housing_move\(uuid, uuid, timestamptz, text\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.record_group_housing_move\(uuid, uuid, timestamptz, text\) to authenticated/i);
  });

  it("identity corrections are append-only, owner-scoped and same-farm checked", () => {
    expect(sql).toMatch(/create table public\.livestock_individual_identity_corrections/i);
    expect(sql).toMatch(/fact text not null check \(fact in \('date_of_birth', 'sex', 'breed'\)\)/i);
    expect(sql).toMatch(/grant select, insert on table public\.livestock_individual_identity_corrections to authenticated/i);
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*livestock_individual_identity_corrections/i);
    expect(sql).toMatch(/alter table public\.livestock_individual_identity_corrections enable row level security/i);
    expect(sql).toMatch(/livestock_identity_corrections_owner_select[\s\S]*for select[\s\S]*to authenticated/i);
    expect(sql).toMatch(/livestock_identity_corrections_owner_insert[\s\S]*for insert[\s\S]*to authenticated/i);
    expect(sql).toMatch(/perform public\.assert_livestock_individual_belongs_to_farm\(new\.animal_id, new\.farm_id\)/i);
    expect(sql).toMatch(/identity_correction_rejected:DATE_OF_BIRTH_IN_FUTURE/);
    // The original animal row is never rewritten by this migration.
    expect(sql).not.toMatch(/update public\.livestock_individuals/i);
  });
});
