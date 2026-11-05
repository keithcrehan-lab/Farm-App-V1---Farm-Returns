import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const recordFact = vi.fn(async (key: unknown, value: unknown) => ({ key, value }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/app/actions/schemes", () => ({
  recordScep2026FactAction: (key: unknown, value: unknown) => recordFact(key, value),
}));

import { Scep2026Card } from "./Scep2026Card";
import { SCHEME_DATA_KEYS } from "@/domain/schemes/data-keys";
import type { Scep2026View } from "@/domain/schemes/scep-2026";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function baseView(participation: boolean | null): Scep2026View {
  const participating = participation === true;
  return {
    schemeVersionId: "version-1",
    schemeVersionKey: "scep:2026:scep-2026-v1",
    name: "Suckler Carbon Efficiency Programme (SCEP)",
    state:
      participation === null
        ? "PARTICIPATION_UNKNOWN"
        : participation
          ? "INFORMATION_MISSING"
          : "NOT_PARTICIPATING",
    stateLabel:
      participation === null
        ? "Check participation"
        : participation
          ? "Information needed"
          : "Not participating",
    summary:
      participation === null
        ? "Tell Farm Return whether this farm is in SCEP."
        : participation
          ? "Complete the remaining SCEP figures."
          : "This farm is recorded as not participating.",
    participation,
    readiness: {
      schemeVersionKey: "scep:2026:scep-2026-v1",
      completeCount: participation === null ? 0 : 4,
      totalCount: participation === null ? 1 : 9,
      percentage: participation === null ? 0 : 44,
      assessable: true,
      items: [],
      alreadyKnown: [],
      needsYou: participating
        ? [
            {
              requirementId: "genotype",
              dataKey: SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
              label: "Genotypes completed",
              owner: "schemes",
              purpose: "action",
              state: "MISSING",
              bucket: "needs_you",
              resolutionOwner: "farmer",
            },
          ]
        : [],
      needsReview: [],
    },
    evaluations: participating
      ? [
          {
            ruleId: "biss",
            ruleKey: "scep-2026-biss",
            sourceId: "source-1",
            state: "PASS",
            inputKeys: [SCHEME_DATA_KEYS.BISS_PARTICIPATION.key],
            detail: "The deterministic rule passed.",
          },
          {
            ruleId: "sblas",
            ruleKey: "scep-2026-sblas",
            sourceId: "source-1",
            state: "PASS",
            inputKeys: [SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key],
            detail: "The deterministic rule passed.",
          },
          {
            ruleId: "survey",
            ruleKey: "scep-2026-action5-review",
            sourceId: "source-1",
            state: "UNKNOWN",
            inputKeys: [SCHEME_DATA_KEYS.SCEP_SURVEYS_SUBMITTED_2026.key],
            detail: "Required canonical data is not recorded yet.",
          },
        ]
      : [],
    actions: participating
      ? [
          {
            key: "calving",
            label: "Calving requirement",
            current: 16,
            target: 15,
            unit: "animals",
            deadline: "2026-06-30",
            deadlineState: "past",
            state: "PASS",
            detail: "16 recorded; target 15.",
          },
          {
            key: "genotyping",
            label: "Action 3 · Genotyping",
            current: 20,
            target: 21,
            unit: "animals",
            deadline: "2026-11-30",
            deadlineState: "upcoming",
            state: "FAIL",
            detail: "20 recorded; target 21.",
          },
        ]
      : [],
    payment: participating
      ? {
          state: "CALCULATED",
          currency: "EUR",
          amount: 4275,
          low: 4275,
          high: 4275,
          method: "scep_2026_area_rate",
          rateStatus: "final",
          detail: "Maximum potential gross payment.",
          sourceIds: ["source-1"],
        }
      : {
          state: "UNSUPPORTED",
          currency: "EUR",
          amount: null,
          low: null,
          high: null,
          method: null,
          rateStatus: "not_applicable",
          detail: "No SCEP payment is estimated.",
          sourceIds: ["source-1"],
        },
    limitations: ["Full compliance is not inferred."],
    nextYear: ["Year 5 target increases to 90%."],
    sources: [
      {
        id: "source-1",
        publisher: "DAFM",
        title: "SCEP",
        url: "https://example.invalid/scep",
        sourceKey: "dafm-service",
      },
    ],
    factValues: {
      [SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key]: participation,
      [SCHEME_DATA_KEYS.SCEP_YEARLY_REFERENCE_2026.key]: participating ? 30 : null,
      [SCHEME_DATA_KEYS.SCEP_SBLAS_CURRENT_2026.key]: participating ? true : null,
      [SCHEME_DATA_KEYS.SCEP_ELIGIBLE_FORAGE_AREA_2026.key]: participating ? 20 : null,
      [SCHEME_DATA_KEYS.SCEP_ELIGIBLE_CALVES_2026.key]: participating ? 16 : null,
      [SCHEME_DATA_KEYS.SCEP_HIGH_MERIT_SIRED_CALVES_2026.key]: participating ? 14 : null,
      [SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key]: participating ? 20 : null,
      [SCHEME_DATA_KEYS.SCEP_WEIGHED_PAIRS_2026.key]: participating ? 12 : null,
      [SCHEME_DATA_KEYS.SCEP_SURVEYS_SUBMITTED_2026.key]: null,
    },
  };
}

describe("Scep2026Card", () => {
  it("asks participation first and hides programme figures until the answer is yes", () => {
    render(<Scep2026Card view={baseView(null)} />);

    expect(
      screen.getByText(/is this farm already participating in SCEP/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("2026 action position")).not.toBeInTheDocument();
    expect(screen.queryByText("Programme figures")).not.toBeInTheDocument();
  });

  it("records participation without accepting a client-supplied farm id", async () => {
    render(<Scep2026Card view={baseView(null)} />);

    fireEvent.click(
      screen.getByRole("button", { name: /yes, this farm is in SCEP/i }),
    );

    await waitFor(() =>
      expect(recordFact).toHaveBeenCalledWith(
        SCHEME_DATA_KEYS.SCEP_PARTICIPATION_2026.key,
        true,
      ),
    );
    expect(recordFact.mock.calls[0]).toHaveLength(2);
  });

  it("shows source-pinned action targets, deadline state and maximum-potential payment", () => {
    render(<Scep2026Card view={baseView(true)} />);

    expect(screen.getByText("2026 action position")).toBeInTheDocument();
    expect(screen.getByText("16 / 15 animals")).toBeInTheDocument();
    expect(screen.getByText(/Deadline passed · 30 Jun 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Deadline · 30 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByText(/€4,275/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/maximum potential gross payment/i).length,
    ).toBeGreaterThan(0);
  });

  it("reuses the existing BISS answer instead of rendering a duplicate BISS editor", () => {
    render(<Scep2026Card view={baseView(true)} />);

    expect(screen.getByText("2026 BISS application")).toBeInTheDocument();
    expect(
      screen.getByText(/Reuses the BISS answer already held/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: /BISS/i }),
    ).not.toBeInTheDocument();
  });

  it("saves an edited scheme-owned programme figure through the scheme action", async () => {
    render(<Scep2026Card view={baseView(true)} />);

    const input = screen.getByRole("spinbutton", {
      name: "Genotypes completed",
    });
    fireEvent.change(input, { target: { value: "21" } });
    const row = input.closest("div[id]") as HTMLElement;
    fireEvent.click(
      row.querySelector("button") as HTMLButtonElement,
    );

    await waitFor(() =>
      expect(recordFact).toHaveBeenCalledWith(
        SCHEME_DATA_KEYS.SCEP_GENOTYPES_COMPLETED_2026.key,
        21,
      ),
    );
  });

  it("does not ask for programme figures when the farm records no participation", () => {
    render(<Scep2026Card view={baseView(false)} />);

    expect(screen.getByText(/not participating in SCEP/i)).toBeInTheDocument();
    expect(screen.queryByText("2026 action position")).not.toBeInTheDocument();
    expect(screen.queryByText("Programme figures")).not.toBeInTheDocument();
  });
});
