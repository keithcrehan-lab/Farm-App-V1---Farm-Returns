import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cattleGroupProductionPlanPayload, rowToCattleGroupProductionPlan } from "./cattle-group-production-plans";

describe("cattle group production plan persistence", () => {
  it("parses a persisted farmer plan without inventing missing fields", () => {
    const plan = rowToCattleGroupProductionPlan({
      group_id: "11111111-1111-4111-8111-111111111111",
      farm_id: "22222222-2222-4222-8222-222222222222",
      target_weight_kg: "500",
      target_date: "2027-02-12",
      diet_label: "Grazing + 2 kg concentrate",
      concentrate_kg_head_day: "2",
      concentrate_price_eur_t: "400",
      forage_cost_eur_head_day: "0.60",
      housing_cost_eur_head_day: null,
      notes: null,
      created_at: "2026-11-04T13:00:00.000Z",
      updated_at: "2026-11-04T13:00:00.000Z",
    } as never);
    expect(plan).toMatchObject({
      targetWeightKg: 500,
      targetDate: "2027-02-12",
      dietLabel: "Grazing + 2 kg concentrate",
      concentrateKgHeadDay: 2,
      concentratePriceEurT: 400,
      forageCostEurHeadDay: 0.6,
    });
    expect(plan).not.toHaveProperty("housingCostEurHeadDay");
  });

  it("keeps the production-plan table farm-owned and hidden from anonymous users", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261104133342_cattle_group_production_plans.sql"),
      "utf8",
    );
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/cattle_group_production_plans_owner_select/i);
    expect(sql).toMatch(/cattle_group_production_plans_owner_insert/i);
    expect(sql).toMatch(/cattle_group_production_plans_owner_update/i);
    expect(sql).toMatch(/cattle_group_production_plans_owner_delete/i);
    expect(sql).toMatch(/revoke all on public\.cattle_group_production_plans from anon/i);
    expect(sql).toMatch(/g\.farm_id = farm_id/i);
  });

  it("reads the nutrition context with its silage provenance", () => {
    const plan = rowToCattleGroupProductionPlan({
      group_id: "g", farm_id: "f", target_weight_kg: null, target_date: null, diet_label: null,
      concentrate_kg_head_day: null, concentrate_price_eur_t: null, forage_cost_eur_head_day: null, housing_cost_eur_head_day: null, notes: null,
      feeding_situation: "housed_grass_silage", silage_quality_basis: "lab_analysis", silage_dmd_pct: "71.5", silage_cp_pct: "12.1", silage_analysis_date: "2026-10-01",
      created_at: "2026-11-04T13:00:00.000Z", updated_at: "2026-11-04T13:00:00.000Z",
    } as never);
    expect(plan).toMatchObject({ feedingSituation: "housed_grass_silage", silageQualityBasis: "lab_analysis", silageDmdPct: 71.5, silageCpPct: 12.1, silageAnalysisDate: "2026-10-01" });
    expect(() => rowToCattleGroupProductionPlan({ group_id: "g", farm_id: "f", silage_quality_basis: "guess", created_at: "", updated_at: "" } as never)).toThrow(/invalid enum/);
  });

  it("writes only the fields a save supplies, so the goal-first form never wipes legacy cost fields", () => {
    const payload = cattleGroupProductionPlanPayload("f", "g", { targetWeightKg: 600, notes: null, silageQualityBasis: null }, "2026-11-04T00:00:00.000Z");
    expect(payload).toEqual({ group_id: "g", farm_id: "f", target_weight_kg: 600, notes: null, silage_quality_basis: null, updated_at: "2026-11-04T00:00:00.000Z" });
  });

  it("adds the nutrition context additively with provenance-shape checks", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261104200000_cattle_group_nutrition_context.sql"), "utf8");
    expect(sql).not.toMatch(/\bdrop\b|\btruncate\b/i);
    expect(sql).toMatch(/silage_quality_basis = 'planning_scenario' and silage_dmd_pct in \(66, 68, 70, 72, 74, 76\)/);
    expect(sql).toMatch(/silage_quality_basis = 'lab_analysis' and silage_dmd_pct is not null and silage_analysis_date is not null/);
  });
});
