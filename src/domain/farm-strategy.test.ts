import { describe, expect, it } from "vitest";
import { compareStrategyToBaseline, type StrategyScenarioInput } from "./farm-strategy";

function scenario(overrides: Partial<StrategyScenarioInput>): StrategyScenarioInput {
  return { id: "s", label: "Scenario", investments: [], annualEffects: [], ...overrides };
}

describe("compareStrategyToBaseline — §10 required deterministic cases", () => {
  it("1. high upfront cost, strong long-term benefit", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Shed", grossCostEur: 30000, costStatus: "estimated", support: { amountEur: 18000, status: "approved", expectedYear: 1, source: "TAMS 3" } }],
        annualEffects: [{ label: "Labour saving", amountEurPerYear: 6000, status: "estimated", source: "farmer estimate" }],
      }),
      10,
    );
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.netEventualCapitalCostEur).toBe(12000);
    expect(outcome.peakCashRequirementEur).toBe(30000);
    expect(outcome.paybackYear).toBe(2);
    expect(outcome.cumulativeDifferenceVsBaselineEur).toBe(48000);
  });

  it("2. delayed support payment — cash position stays worse until the support year lands", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Investment", grossCostEur: 20000, costStatus: "estimated", support: { amountEur: 10000, status: "approved", expectedYear: 3, source: "scheme" } }],
        annualEffects: [{ label: "Benefit", amountEurPerYear: 3000, status: "estimated", source: "farmer estimate" }],
      }),
      5,
    );
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.timeline[0].cumulativeDifferenceVsBaselineEur).toBe(-17000);
    expect(outcome.timeline[2].supportReceivedEur).toBe(10000);
    expect(outcome.paybackYear).toBe(4);
  });

  it("3. no support at all", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Investment", grossCostEur: 15000, costStatus: "estimated" }],
        annualEffects: [{ label: "Benefit", amountEurPerYear: 2000, status: "estimated", source: "farmer estimate" }],
      }),
      10,
    );
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.supportApprovedOrActualEur).toBe(0);
    expect(outcome.netEventualCapitalCostEur).toBe(15000);
    expect(outcome.paybackYear).toBe(8);
  });

  it("4. expected support but not yet approved — never counted as real money", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Investment", grossCostEur: 20000, costStatus: "estimated", support: { amountEur: 10000, status: "estimated", expectedYear: 1, source: "farmer hope" } }],
        annualEffects: [{ label: "Benefit", amountEurPerYear: 1000, status: "estimated", source: "farmer estimate" }],
      }),
      5,
    );
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.supportApprovedOrActualEur).toBe(0);
    expect(outcome.supportEstimatedNotApprovedEur).toBe(10000);
    expect(outcome.netEventualCapitalCostEur).toBe(20000);
    expect(outcome.timeline.every((p) => p.supportReceivedEur === 0)).toBe(true);
    expect(outcome.paybackYear).toBeNull();
  });

  it("5. missing support-payment timing — reduces net capital cost but never enters the cash timeline", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Investment", grossCostEur: 20000, costStatus: "estimated", support: { amountEur: 10000, status: "approved", source: "scheme" } }],
        annualEffects: [{ label: "Benefit", amountEurPerYear: 3000, status: "estimated", source: "farmer estimate" }],
      }),
      10,
    );
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.supportTimingUnknown).toBe(true);
    expect(outcome.netEventualCapitalCostEur).toBe(10000);
    expect(outcome.timeline.every((p) => p.supportReceivedEur === 0)).toBe(true);
    expect(outcome.paybackYear).toBe(7);
  });

  it("6. negative-return investment", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Investment", grossCostEur: 10000, costStatus: "estimated" }],
        annualEffects: [
          { label: "Small benefit", amountEurPerYear: 200, status: "estimated", source: "farmer estimate" },
          { label: "Ongoing extra cost", amountEurPerYear: -100, status: "estimated", source: "farmer estimate" },
        ],
      }),
      10,
    );
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.cumulativeDifferenceVsBaselineEur).toBe(-9000);
    expect(outcome.paybackYear).toBeNull();
  });

  it("7. insufficient evidence — no fake baseline comparison", () => {
    const { scenario: outcome } = compareStrategyToBaseline(scenario({}), 5);
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("Codex audit round 6: a scenario carrying only a zero-valued annual effect is insufficient evidence, not a false payback", () => {
    const { scenario: outcome } = compareStrategyToBaseline(scenario({ annualEffects: [{ label: "No real change", amountEurPerYear: 0, status: "estimated", source: "s" }] }), 5);
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
    if (outcome.status === "INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("NO_GENUINE_FINANCIAL_IMPACT");
  });

  it("Codex audit round 6: a zero-cost investment with no effects is also insufficient evidence", () => {
    const { scenario: outcome } = compareStrategyToBaseline(scenario({ investments: [{ label: "x", grossCostEur: 0, costStatus: "estimated" }] }), 5);
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
    if (outcome.status === "INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("NO_GENUINE_FINANCIAL_IMPACT");
  });

  it("rejects a negative gross cost rather than producing a nonsensical negative capital requirement", () => {
    const { scenario: outcome } = compareStrategyToBaseline(scenario({ investments: [{ label: "x", grossCostEur: -1000, costStatus: "estimated" }] }), 5);
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("rejects support that exceeds its own investment's gross cost", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({ investments: [{ label: "x", grossCostEur: 10000, costStatus: "estimated", support: { amountEur: 15000, status: "approved", expectedYear: 1, source: "s" } }] }),
      5,
    );
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("rejects a support expectedYear outside the requested horizon", () => {
    const { scenario: outcome } = compareStrategyToBaseline(
      scenario({ investments: [{ label: "x", grossCostEur: 10000, costStatus: "estimated", support: { amountEur: 5000, status: "approved", expectedYear: 20, source: "s" } }] }),
      5,
    );
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("rejects a non-finite annual effect amount", () => {
    const { scenario: outcome } = compareStrategyToBaseline(scenario({ annualEffects: [{ label: "x", amountEurPerYear: Number.NaN, status: "estimated", source: "s" }] }), 5);
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("rejects an endsYear before its own startsYear", () => {
    const { scenario: outcome } = compareStrategyToBaseline(scenario({ annualEffects: [{ label: "x", amountEurPerYear: 100, startsYear: 5, endsYear: 2, status: "estimated", source: "s" }] }), 10);
    expect(outcome.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("8. Year 1 poor but Year 5/10 strong — the same scenario at different horizons tells the truth for each", () => {
    const input = scenario({
      investments: [{ label: "Investment", grossCostEur: 5000, costStatus: "estimated" }],
      annualEffects: [
        { label: "Transition cost", amountEurPerYear: -1000, startsYear: 1, endsYear: 2, status: "estimated", source: "farmer estimate" },
        { label: "Ongoing benefit", amountEurPerYear: 2500, startsYear: 3, status: "estimated", source: "farmer estimate" },
      ],
    });
    const year1 = compareStrategyToBaseline(input, 1).scenario;
    const year10 = compareStrategyToBaseline(input, 10).scenario;
    if (year1.status !== "OK" || year10.status !== "OK") throw new Error("expected OK");
    expect(year1.cumulativeDifferenceVsBaselineEur).toBe(-6000);
    expect(year1.paybackYear).toBeNull();
    expect(year10.cumulativeDifferenceVsBaselineEur).toBe(13000);
    expect(year10.paybackYear).toBe(5);
  });

  it("9. grant makes an investment less bad but still unattractive over the horizon", () => {
    const withGrant = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Investment", grossCostEur: 50000, costStatus: "estimated", support: { amountEur: 20000, status: "approved", expectedYear: 1, source: "scheme" } }],
        annualEffects: [{ label: "Weak benefit", amountEurPerYear: 1000, status: "estimated", source: "farmer estimate" }],
      }),
      10,
    ).scenario;
    const withoutGrant = compareStrategyToBaseline(
      scenario({
        investments: [{ label: "Investment", grossCostEur: 50000, costStatus: "estimated" }],
        annualEffects: [{ label: "Weak benefit", amountEurPerYear: 1000, status: "estimated", source: "farmer estimate" }],
      }),
      10,
    ).scenario;
    if (withGrant.status !== "OK" || withoutGrant.status !== "OK") throw new Error("expected OK");
    expect(withGrant.cumulativeDifferenceVsBaselineEur).toBe(-20000);
    expect(withoutGrant.cumulativeDifferenceVsBaselineEur).toBe(-40000);
    expect(withGrant.cumulativeDifferenceVsBaselineEur).toBeGreaterThan(withoutGrant.cumulativeDifferenceVsBaselineEur);
    expect(withGrant.paybackYear).toBeNull();
    expect(withoutGrant.paybackYear).toBeNull();
  });
});
