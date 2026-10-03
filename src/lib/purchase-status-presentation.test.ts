import { describe, expect, it } from "vitest";
import { purchaseStatusPresentation } from "./purchase-status-presentation";

describe("purchaseStatusPresentation (Session 2b)", () => {
  it("a sized blend shows products; credit not counted is provisional with the engine's own text", () => {
    expect(purchaseStatusPresentation({ status: "RECOMMENDED" })).toEqual({ kind: "products" });
    expect(
      purchaseStatusPresentation(
        { status: "RECOMMENDED_CREDIT_NOT_COUNTED", reasonCode: "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED", missingInputs: [] },
        { isProvisional: true, headline: "H", detail: "D" },
      ),
    ).toEqual({ kind: "products", provisional: { headline: "H", detail: "D" } });
  });

  it("NONE_NEEDED and PROHIBITED are a decided nothing-to-buy", () => {
    expect(purchaseStatusPresentation({ status: "NONE_NEEDED", basis: "REMAINING_ZERO" })).toEqual({ kind: "nothing_to_buy", reason: "NONE_NEEDED" });
    expect(purchaseStatusPresentation({ status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" })).toEqual({ kind: "nothing_to_buy", reason: "PROHIBITED" });
  });

  it("UNKNOWN, WITHHELD and NOT_APPLICABLE are unavailable with a reason — never nothing-to-buy", () => {
    expect(purchaseStatusPresentation({ status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] })).toMatchObject({
      kind: "unavailable",
      label: "Insufficient evidence",
      message: expect.stringMatching(/livestock group/),
    });
    expect(purchaseStatusPresentation({ status: "UNKNOWN", reasonCode: "SOMETHING_NEW", missingInputs: [] })).toMatchObject({ kind: "unavailable", label: "Insufficient evidence" });
    expect(purchaseStatusPresentation({ status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE", missingInputs: ["fertility.kIndex"] })).toMatchObject({
      kind: "unavailable",
      label: "Withheld",
    });
    expect(purchaseStatusPresentation({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" })).toMatchObject({
      kind: "unavailable",
      label: "Not applicable",
      message: expect.stringMatching(/tillage/),
    });
  });
});
