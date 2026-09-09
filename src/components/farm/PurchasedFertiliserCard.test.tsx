import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PurchasedFertiliserCard } from "./PurchasedFertiliserCard";
import { tracked } from "@/domain/types";
import type { NutrientPlan } from "@/domain/types";

afterEach(() => {
  cleanup();
});

const PRODUCTS: NutrientPlan["purchasedProducts"] = [
  { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 200, totalKg: 1000, costEur: 620, formulation: tracked({ physicalForm: "solid", ureicNPercent: 0, inhibitorStatus: "inhibited" }, "verified", "Product catalogue") },
];

// Codex audit CRITICAL (round 26): this card used to gate only on
// `fertilityEvidence` — a field blocked for the new silage-evidence
// reason (a real silage-cut field with no real cut/yield plan) had
// fertilityEvidence.status === "OK" but products: [], rendering an
// empty table with "Estimated field cost €0" as if genuinely nothing
// were needed.
describe("PurchasedFertiliserCard", () => {
  it("shows the real product table when the requirement is genuinely calculable", () => {
    render(<PurchasedFertiliserCard products={PRODUCTS} estimatedFieldCostEur={620} requirement={tracked({ n: 125, p: 20, k: 125 }, "estimated", "Teagasc Green Book")} />);
    expect(screen.getAllByText("18-6-12").length).toBeGreaterThan(0);
    expect(screen.getByText(/estimated field cost/i)).toBeTruthy();
  });

  it("discloses the real reason instead of a false zero when the P/K Soil Index is missing", () => {
    render(
      <PurchasedFertiliserCard
        products={[]}
        estimatedFieldCostEur={0}
        requirement={tracked({ n: 125, p: 0, k: 0 }, "unavailable", "This field's P/K Soil Index has not been recorded — add a soil test or a farmer estimate to unlock a fertiliser plan.")}
      />,
    );
    expect(screen.queryByText("18-6-12")).toBeNull();
    expect(screen.getByText(/insufficient evidence/i)).toBeTruthy();
    expect(screen.getByText(/p\/k soil index has not been recorded/i)).toBeTruthy();
  });

  it("discloses the real silage-evidence reason instead of a false zero for a silage field with no real cut/yield plan", () => {
    render(
      <PurchasedFertiliserCard
        products={[]}
        estimatedFieldCostEur={0}
        requirement={tracked(
          { n: 0, p: 0, k: 0 },
          "unavailable",
          "This field is recorded as a silage cut but has no real cut/yield plan to calculate its silage-specific N/P/K requirement from.",
        )}
      />,
    );
    expect(screen.getByText(/insufficient evidence/i)).toBeTruthy();
    expect(screen.getByText(/silage cut but has no real cut\/yield plan/i)).toBeTruthy();
    // Never the P/K-specific copy for this different real reason.
    expect(screen.queryByText(/p\/k soil index has not been recorded/i)).toBeNull();
  });
});
