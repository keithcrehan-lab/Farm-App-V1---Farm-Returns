import {
  FERTILISER_QUOTE_DELIVERY_CAPABILITY,
  type FertiliserQuoteRequest,
  type FertiliserQuoteRequestIssue,
  type FertiliserQuoteRequestStatus,
} from "@/domain/fertiliser-quote-request";
import type { StatusTone } from "@/lib/status";
import { pluralFields } from "@/lib/farm-fertiliser-basket-presentation";

/**
 * Fertiliser Vertical Completion, Session 4 — presentation selection for the
 * fertiliser quote request workflow. Reads the request produced by
 * `src/domain/fertiliser-quote-request.ts`; derives no quantity or price.
 */

export interface QuoteRequestStatusPresentation {
  label: string;
  tone: StatusTone;
}

export function quoteRequestStatusPresentation(status: FertiliserQuoteRequestStatus): QuoteRequestStatusPresentation {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", tone: "neutral" };
    case "READY_TO_SEND":
      return { label: "Ready to send", tone: "good" };
    case "SENT":
      return { label: "Sent", tone: "good" };
    case "FAILED":
      return { label: "Sending failed", tone: "risk" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
  }
}

export interface QuoteCoverageNotice {
  tone: StatusTone;
  title: string;
  message: string;
}

/** Whole-farm, provisional or partial — a partial request is never presented
 * as the farm's full requirement. */
export function quoteCoverageNotice(
  request: Pick<FertiliserQuoteRequest, "coverage" | "unresolvedFields" | "unsupportedProducts"> & { lines: readonly Pick<FertiliserQuoteRequest["lines"][number], "provisional">[] },
): QuoteCoverageNotice {
  switch (request.coverage) {
    case "WHOLE_FARM":
      return { tone: "good", title: "Whole-farm requirement", message: "Every field is resolved — this request covers the farm's full fertiliser requirement." };
    case "WHOLE_FARM_PROVISIONAL":
      return {
        tone: "attention",
        title: "Provisional quantities",
        message: "One or more quantities are provisional: planned slurry's nutrient credit isn't counted yet, so they may change.",
      };
    case "PARTIAL": {
      const parts = ["Partial request — this covers only the products Farm Return could calculate, not the farm's full requirement."];
      const n = request.unresolvedFields.length;
      if (n > 0) parts.push(`Not included: ${request.unresolvedFields.map((f) => f.fieldName).join(", ")} (${pluralFields(n)} needing more information).`);
      if (request.unsupportedProducts.length > 0) parts.push("A product isn't in Farm Return's verified catalogue.");
      if (request.lines.some((l) => l.provisional)) parts.push("One or more included quantities are provisional: planned slurry's nutrient credit isn't counted yet, so they may change.");
      return { tone: "risk", title: "Partial request", message: parts.join(" ") };
    }
  }
}

const ISSUE_MESSAGES: Record<FertiliserQuoteRequestIssue, string> = {
  EMPTY_BASKET: "There are no products to request.",
  MISSING_PRODUCT_IDENTITY: "A product is missing its name or N-P-K analysis.",
  INVALID_CANONICAL_QUANTITY: "A product's calculated quantity is invalid.",
  UNKNOWN_PRODUCT: "That product isn't in this request.",
  INVALID_REQUESTED_QUANTITY: "Enter a quantity greater than zero, to the nearest 0.01 t.",
  MISSING_DELIVERY_LOCATION: "Add a delivery location.",
  MISSING_CONTACT: "Add a contact name or number for the supplier.",
  INVALID_DELIVERY_WINDOW: "The delivery window needs two real dates, with the start on or before the end.",
  INVALID_RECIPIENT: "Each supplier needs a name.",
  INVALID_STATUS_TRANSITION: "This request can't be changed in its current state.",
  UNKNOWN_RECIPIENT: "That supplier isn't on this request.",
  MISSING_PROVIDER_REFERENCE: "Delivery wasn't confirmed.",
};

export function quoteRequestIssueMessages(issues: readonly FertiliserQuoteRequestIssue[]): string[] {
  return [...new Set(issues)].map((i) => ISSUE_MESSAGES[i]);
}

/** Truthful action wording: "Request quote" only once a real delivery
 * integration exists; today the request can only be prepared. */
export function quoteSubmitLabel(): string {
  return FERTILISER_QUOTE_DELIVERY_CAPABILITY.status === "UNAVAILABLE" ? "Prepare quote request" : "Request quote";
}

export function readyToSendMessage(): string {
  return "Ready to send. Farm Return hasn't sent this to any supplier — copy the request below and send it to your supplier yourself.";
}

/** Requested-vs-calculated note for one line; `null` when they match the
 * rounded purchase quantity. */
export function requestedQuantityNote(line: Pick<FertiliserQuoteRequest["lines"][number], "requestedBelowCanonical" | "requestedTonnes" | "canonicalDisplayTonnes">): string | null {
  if (line.requestedBelowCanonical) return "Below the calculated requirement.";
  if (line.requestedTonnes !== line.canonicalDisplayTonnes) return "Differs from the calculated requirement.";
  return null;
}

/** Prefill text for the delivery location and contact from the farm's saved
 * delivery details (`farm_delivery_details`); the farmer can edit both. */
export function deliveryPrefillFromFarmDetails(
  details: {
    contactName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    addressLine1: string;
    addressLine2: string | null;
    townOrCity: string;
    county: string;
    eircode: string | null;
  } | null,
): { deliveryLocation: string; contact: string } {
  if (!details) return { deliveryLocation: "", contact: "" };
  const join = (parts: (string | null)[]) => parts.map((p) => p?.trim() ?? "").filter((p) => p.length > 0).join(", ");
  return {
    deliveryLocation: join([details.addressLine1, details.addressLine2, details.townOrCity, details.county, details.eircode]),
    contact: join([details.contactName, details.contactPhone, details.contactEmail]),
  };
}
