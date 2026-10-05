import { describe, expect, it } from "vitest";
import {
  deliveryPrefillFromFarmDetails,
  quoteCoverageNotice,
  quoteRequestIssueMessages,
  quoteRequestStatusPresentation,
  quoteSubmitLabel,
  requestedQuantityNote,
} from "./fertiliser-quote-request-presentation";

describe("fertiliser quote request presentation", () => {
  it("uses truthful wording while no supplier delivery integration exists", () => {
    expect(quoteSubmitLabel()).toBe("Prepare quote request");
    expect(quoteRequestStatusPresentation("READY_TO_SEND").label).toBe("Ready to send");
    expect(quoteRequestStatusPresentation("FAILED").tone).toBe("risk");
  });

  it("never presents a partial request as the whole farm", () => {
    const partial = quoteCoverageNotice({ coverage: "PARTIAL", unresolvedFields: [{ fieldId: "f2", fieldName: "Hill Field", status: "UNKNOWN" }], unsupportedProducts: [] });
    expect(partial.title).toBe("Partial request");
    expect(partial.message).toContain("not the farm's full requirement");
    expect(partial.message).toContain("Hill Field");
    expect(quoteCoverageNotice({ coverage: "WHOLE_FARM_PROVISIONAL", unresolvedFields: [], unsupportedProducts: [] }).title).toBe("Provisional quantities");
    expect(quoteCoverageNotice({ coverage: "WHOLE_FARM", unresolvedFields: [], unsupportedProducts: [] }).tone).toBe("good");
  });

  it("notes a requested quantity that differs from or is below the calculated requirement", () => {
    expect(requestedQuantityNote({ requestedBelowCanonical: false, requestedTonnes: 2.4, canonicalDisplayTonnes: 2.4 })).toBeNull();
    expect(requestedQuantityNote({ requestedBelowCanonical: false, requestedTonnes: 3, canonicalDisplayTonnes: 2.4 })).toMatch(/Differs/);
    expect(requestedQuantityNote({ requestedBelowCanonical: true, requestedTonnes: 2, canonicalDisplayTonnes: 2.4 })).toMatch(/Below/);
  });

  it("de-duplicates issue messages", () => {
    expect(quoteRequestIssueMessages(["MISSING_CONTACT", "MISSING_CONTACT"])).toHaveLength(1);
  });

  it("prefills delivery location and contact from saved farm delivery details, skipping blanks", () => {
    expect(deliveryPrefillFromFarmDetails(null)).toEqual({ deliveryLocation: "", contact: "" });
    expect(
      deliveryPrefillFromFarmDetails({
        contactName: "Pat",
        contactPhone: null,
        contactEmail: "pat@example.ie",
        addressLine1: "Farm yard",
        addressLine2: " ",
        townOrCity: "Ballyduff",
        county: "Kerry",
        eircode: "V92 X000",
      }),
    ).toEqual({ deliveryLocation: "Farm yard, Ballyduff, Kerry, V92 X000", contact: "Pat, pat@example.ie" });
  });
});
