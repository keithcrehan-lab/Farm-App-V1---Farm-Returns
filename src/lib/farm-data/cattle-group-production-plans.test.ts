import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rowToCattleGroupProductionPlan } from "./cattle-group-production-plans";

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
});
