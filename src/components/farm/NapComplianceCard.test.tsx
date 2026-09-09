import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NapComplianceCard } from "./NapComplianceCard";
import type { NapComplianceCheck } from "@/domain/types";

afterEach(() => {
  cleanup();
});

function compliance(overrides: Partial<NapComplianceCheck> = {}): NapComplianceCheck {
  return {
    landUse: "grazing",
    orgNStockingRateKgHa: 120,
    nRequiredKgHa: 100,
    nCeilingKgHa: 170,
    nWithinCeiling: true,
    pRequiredKgHa: 10,
    pCeilingKgHa: 20,
    pWithinCeiling: true,
    regulatory: "compliance_value",
    legislation: "S.I. 588/2025",
    saleEvidenceRequired: false,
    saleEvidenceConfirmed: false,
    pBuildUpEligibilityApplicable: false,
    pBuildUpEligibilityConfirmed: false,
    ...overrides,
  } as NapComplianceCheck;
}

// Codex audit CRITICAL (round 28): a field whose plannedUse was never
// recorded got a confidently-classified "Statutory ceiling" NAP result
// assuming grazing, with no disclosure this was an assumption.
describe("NapComplianceCard", () => {
  it("shows a confirmed 'Statutory ceiling' pill and no disclosure when regulatory is compliance_value", () => {
    render(<NapComplianceCard compliance={{ status: "OK", value: compliance(), evidenceState: "IRISH_MODEL" }} />);
    expect(screen.getByText(/statutory ceiling/i)).toBeTruthy();
    expect(screen.queryByText(/hasn.t been recorded yet/i)).toBeNull();
  });

  it("shows 'Unconfirmed' and the real reason when plannedUse was never recorded", () => {
    render(
      <NapComplianceCard
        compliance={{
          status: "OK",
          value: compliance({ regulatory: "planning_advice", plannedUseUnresolvedReason: "This field's planned land use hasn't been recorded yet — this NAP classification assumes grazing until confirmed on the Field Detail screen." }),
          evidenceState: "IRISH_MODEL",
        }}
      />,
    );
    expect(screen.getByText(/unconfirmed/i)).toBeTruthy();
    expect(screen.getByText(/hasn.t been recorded yet/i)).toBeTruthy();
  });

  // Codex audit HIGH (round 29): the exceedance paragraph and the red
  // N/P figures previously rendered with the same confirmed-violation
  // styling regardless of `regulatory` — qualified wording/tone for the
  // unconfirmed case.
  it("qualifies the exceedance paragraph as unconfirmed, never a confident statement of fact, when regulatory is planning_advice", () => {
    render(
      <NapComplianceCard
        compliance={{
          status: "OK",
          value: compliance({
            nWithinCeiling: false,
            regulatory: "planning_advice",
            plannedUseUnresolvedReason: "This field's planned land use hasn't been recorded yet.",
          }),
          evidenceState: "IRISH_MODEL",
        }}
      />,
    );
    expect(screen.getByText(/based on an unconfirmed classification/i)).toBeTruthy();
    expect(screen.queryByText(/^planned application exceeds/i)).toBeNull();
  });

  it("states the exceedance as confirmed fact when regulatory is compliance_value", () => {
    render(
      <NapComplianceCard
        compliance={{ status: "OK", value: compliance({ nWithinCeiling: false }), evidenceState: "IRISH_MODEL" }}
      />,
    );
    expect(screen.getByText(/^planned application exceeds/i)).toBeTruthy();
    expect(screen.queryByText(/based on an unconfirmed classification/i)).toBeNull();
  });

  it("shows both real disclosures when a soil test is disregarded AND plannedUse is unresolved at once", () => {
    render(
      <NapComplianceCard
        compliance={{
          status: "OK",
          value: compliance({
            regulatory: "planning_advice",
            soilTestDisregardedReason: "This field's soil P Index comes from a lab test that is now legally disregarded.",
            plannedUseUnresolvedReason: "This field's planned land use hasn't been recorded yet.",
          }),
          evidenceState: "IRISH_MODEL",
        }}
      />,
    );
    expect(screen.getByText(/legally disregarded/i)).toBeTruthy();
    expect(screen.getByText(/hasn.t been recorded yet/i)).toBeTruthy();
  });
});
