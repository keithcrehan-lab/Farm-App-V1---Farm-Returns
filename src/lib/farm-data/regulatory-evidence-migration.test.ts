import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static regression coverage for
 * `20260927000000_regulatory_neat_slurry_and_spreadable_area_evidence.sql`.
 *
 * These tests read the migration SQL — they do NOT execute it. No
 * PostgreSQL server, Docker or local Supabase stack is available to this
 * repository's test runner, so the check constraints, RLS policies,
 * grants and the gross-area trigger remain unexecuted. The migration has
 * NOT been applied to `Farm Return V1 Dev`.
 */

const FILE = "20260927000000_regulatory_neat_slurry_and_spreadable_area_evidence.sql";
const raw = readFileSync(path.resolve(__dirname, "../../../supabase/migrations", FILE), "utf8");
const sql = raw.replace(/--[^\n]*/g, "");

function table(name: string): string {
  const m = sql.match(new RegExp(`create table public\\.${name} \\(([\\s\\S]*?)\\n\\);`, "i"));
  if (!m) throw new Error(`table ${name} not found`);
  return m[1];
}

const neat = table("slurry_store_neat_evidence_records");
const area = table("field_spreadable_area_records");
const trigger = sql.match(/function public\.field_spreadable_area_records_stamp_gross_area\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/i)?.[1] ?? "";

describe("Campaign B evidence migration (static — SQL not executed)", () => {
  it("is additive and forward-only: no drop/alter/update/delete of existing objects, no backfill", () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy|function)\b/i);
    expect(sql).not.toMatch(/\balter table public\.(housing|fields|slurry_composition_records)\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(raw).toMatch(/NOT YET APPLIED to `Farm Return V1 Dev`/);
  });

  it("does not touch or read the physical volume or gross-area columns as evidence values", () => {
    expect(sql).not.toMatch(/storage_capacity_m3|storage_fill_pct/i);
    // The only read of fields.area_ha is the database-owned stamp.
    expect(sql.match(/\barea_ha\b/gi)?.length).toBe(1);
    expect(trigger).toMatch(/select fl\.area_ha into gross from public\.fields fl where fl\.id = new\.field_id and fl\.farm_id = new\.farm_id/i);
  });

  describe("neat-slurry evidence table", () => {
    it("has no default volume — absence of a row (or null) never means 0", () => {
      expect(neat).toMatch(/neat_volume_m3 numeric check/i);
      expect(neat).not.toMatch(/neat_volume_m3[^,]*default/i);
    });

    it("rejects negative, NaN and infinite volumes", () => {
      expect(neat).toMatch(/neat_volume_m3 >= 0 and neat_volume_m3 <> 'NaN'::numeric and neat_volume_m3 <> 'Infinity'::numeric/i);
    });

    it("only farmer_adjusted/verified/unavailable, and volume present iff not unavailable", () => {
      expect(neat).toMatch(/status in \('farmer_adjusted', 'verified', 'unavailable'\)/i);
      expect(neat).toMatch(/\(status = 'unavailable' and neat_volume_m3 is null\)\s+or \(status <> 'unavailable' and neat_volume_m3 is not null\)/i);
    });

    it("keeps provenance: effective date and non-blank source are required", () => {
      expect(neat).toMatch(/effective_date date not null/i);
      expect(neat).toMatch(/source text not null check \(length\(btrim\(source\)\) > 0\)/i);
    });
  });

  describe("spreadable-area table", () => {
    it("has no default area and rejects negative/NaN/infinite", () => {
      expect(area).toMatch(/spreadable_area_ha numeric not null check \(\s*spreadable_area_ha >= 0 and spreadable_area_ha <> 'NaN'::numeric and spreadable_area_ha <> 'Infinity'::numeric/i);
      expect(area).not.toMatch(/spreadable_area_ha[^,]*default/i);
      expect(area).toMatch(/status in \('farmer_adjusted', 'verified'\)/i);
    });

    it("never exceeds the gross area stamped at recording", () => {
      expect(area).toMatch(/gross_area_ha_at_record is null or spreadable_area_ha <= gross_area_ha_at_record::numeric/i);
    });

    it("the trigger overwrites any client stamp and rejects (never clamps) an area above known gross", () => {
      expect(trigger).toMatch(/new\.gross_area_ha_at_record := null;/i);
      expect(trigger).toMatch(/new\.gross_area_ha_at_record := gross;/i);
      expect(trigger).toMatch(/if new\.spreadable_area_ha > gross::numeric then\s+raise exception 'field_spreadable_area_rejected:EXCEEDS_GROSS_AREA'/i);
      expect(trigger).not.toMatch(/new\.spreadable_area_ha :=/i);
      expect(trigger).not.toMatch(/least\(|greatest\(/i);
      expect(sql).toMatch(/before insert on public\.field_spreadable_area_records/i);
      expect(sql).toMatch(/security invoker\s+set search_path = pg_catalog, public/i);
    });
  });

  describe("RLS and grants follow the append-only owner-scoped convention", () => {
    for (const t of ["slurry_store_neat_evidence_records", "field_spreadable_area_records"]) {
      it(`${t}: RLS on, owner read/insert only, no update/delete`, () => {
        expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, "i"));
        expect(sql).toMatch(new RegExp(`"${t}_owner_read" on public\\.${t}\\s+for select\\s+to authenticated`, "i"));
        expect(sql).toMatch(new RegExp(`"${t}_owner_insert" on public\\.${t}\\s+for insert\\s+to authenticated`, "i"));
        expect(sql).not.toMatch(new RegExp(`on public\\.${t}\\s+for (update|delete|all)`, "i"));
        // Default-ACL hazard (20260902050000): revoke from authenticated before granting.
        const revoke = sql.search(new RegExp(`revoke all on public\\.${t} from anon, authenticated;`, "i"));
        const grant = sql.search(new RegExp(`grant select, insert on public\\.${t} to authenticated;`, "i"));
        expect(revoke).toBeGreaterThan(-1);
        expect(grant).toBeGreaterThan(revoke);
      });
    }

    it("capture provenance (created_by/created_at) is stamped by the database on both tables, never client-owned", () => {
      const stamp = sql.match(/function public\.regulatory_evidence_records_stamp_capture\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/i)?.[1] ?? "";
      expect(stamp).toMatch(/new\.created_by := auth\.uid\(\);/i);
      expect(stamp).toMatch(/new\.created_at := clock_timestamp\(\);/i);
      for (const t of ["slurry_store_neat_evidence_records", "field_spreadable_area_records"]) {
        expect(sql).toMatch(
          new RegExp(`before insert on public\\.${t}\\s+for each row execute function public\\.regulatory_evidence_records_stamp_capture\\(\\)`, "i"),
        );
      }
    });

    it("insert policies bind the store/field to the same farm, with outer columns qualified", () => {
      expect(sql).toMatch(/h\.id = slurry_store_neat_evidence_records\.housing_id and h\.farm_id = slurry_store_neat_evidence_records\.farm_id/i);
      expect(sql).toMatch(/fl\.id = field_spreadable_area_records\.field_id and fl\.farm_id = field_spreadable_area_records\.farm_id/i);
    });
  });
});
