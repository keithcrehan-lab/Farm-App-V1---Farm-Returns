/**
 * Managed Quote Pilot, Checkpoint 1 — pure request/demand domain logic.
 *
 * Scope (`docs/farm-return-next/MANAGED_QUOTE_PILOT_ARCHITECTURE.md`
 * sections 2-6): a farmer's quote request is one product/quantity/unit
 * ask with a preferred delivery window; each edit after first submission
 * is a new, immutable revision, never an in-place mutation. This module
 * validates that input, derives the farmer-visible status from real
 * workflow facts (never a client-set value), and groups compatible
 * requests for the operator's demand inbox — exactly the "compatible
 * product/unit/date grouping only, no routing/purchasing engine" scope
 * `quote-workflow-implementation-plan.md`'s Checkpoint 1 names. No I/O,
 * no id/timestamp generation — the persistence/orchestration layer
 * supplies those and calls this module's pure functions to validate and
 * compute, per `AGENTS.md`'s domain-layer rule.
 *
 * Three quantities never collapse into one (the brief's own explicit
 * requirement): `quantityBasis: "estimated"` preserves exactly the
 * `FarmInputDemand` figure the farmer started from (via
 * `estimateSnapshot`, including its real truncation/uncertainty flags —
 * never silently dropped); the request's own `quantity` is what the
 * farmer actually confirmed or typed, which may differ from that
 * estimate; a supplier's quoted quantity is a Checkpoint 3 concept this
 * module does not model at all.
 */

import { isValidIsoUtcDateTime } from "./iso-datetime";

// ---------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------

export const QUOTE_REQUEST_UNITS = ["kg", "tonnes", "bags"] as const;
export type QuoteRequestUnit = (typeof QUOTE_REQUEST_UNITS)[number];

/** A bare SI unit-of-measure fact (1 tonne = 1000 kg) — no
 * `evidence-register.md` entry needed, the same "modules with no
 * external source" precedent `units.ts`'s acre/hectare conversion and
 * `wind-speed.ts`'s m/s-to-km/h conversion already established. */
export const TONNE_TO_KG = 1000;

/**
 * Converts a quantity to kg when the unit's kg equivalent is a known,
 * undisputed fact (`kg`, `tonnes`) — returns `null`, never a guess, for
 * `bags` or any other unit this app has no verified pack weight for
 * (brief: "A bag-to-kg conversion requires a known pack weight" — none
 * exists anywhere in this app; see `MANAGED_QUOTE_PILOT_ARCHITECTURE.md`
 * section 5's "Concurrency and integrity" note). This is a data-
 * completeness gate for a purchasing workflow, not a scientific/
 * statutory calculation — it deliberately does not reuse `evidence.ts`'s
 * `EngineOutcome`/reason-code registry, which is reserved for
 * agronomic/regulatory gates.
 */
export function quoteQuantityToKgIfKnown(quantity: number, unit: QuoteRequestUnit): number | null {
  switch (unit) {
    case "kg":
      return quantity;
    case "tonnes":
      return quantity * TONNE_TO_KG;
    case "bags":
      return null;
  }
}

// ---------------------------------------------------------------------
// Quantity provenance
// ---------------------------------------------------------------------

export type QuoteQuantityBasis = "estimated" | "farmer_entered";

/**
 * The exact `FarmInputDemand` figure a farmer's request started from,
 * preserved verbatim alongside the request even after they adjust the
 * quantity — `remainingRequirementKg`'s own real limitations
 * (`src/domain/fertiliser-plan.ts`'s doc comments; repository-review R2)
 * must stay visible on the request, never silently dropped once
 * captured.
 */
export interface QuoteRequestEstimateSnapshot {
  remainingRequirementKg: number;
  /** True when the farm-wide demand read this depended on hit its own
   * row cap — the estimate may understate the truth. */
  truncated: boolean;
  applicationsWithUnknownComposition: number;
  fieldsWithBlockedEvidence: number;
  /** Real ISO datetime this snapshot was taken — an estimate is a
   * point-in-time read, never presented as live. */
  asOf: string;
}

// ---------------------------------------------------------------------
// Delivery window
// ---------------------------------------------------------------------

export interface QuoteDeliveryWindow {
  /** ISO calendar date, `YYYY-MM-DD`. */
  start: string;
  end: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealCalendarDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value) && isValidIsoUtcDateTime(`${value}T00:00:00.000Z`);
}

/**
 * Validates a delivery window is two real calendar dates with `start`
 * on or before `end`. Deliberately does not reject a window already in
 * the past — an operator may legitimately record a request for
 * historical/backfill reasons, and inventing a "no past dates" business
 * rule the owner never specified is exactly what `AGENTS.md` forbids.
 */
export function validateQuoteDeliveryWindow(input: unknown): QuoteDeliveryWindow {
  if (typeof input !== "object" || input === null) {
    throw new Error("validateQuoteDeliveryWindow: expected an object with start/end dates");
  }
  const { start, end } = input as Record<string, unknown>;
  if (typeof start !== "string" || !isRealCalendarDate(start)) {
    throw new Error("validateQuoteDeliveryWindow: start must be a real, existing ISO calendar date (YYYY-MM-DD)");
  }
  if (typeof end !== "string" || !isRealCalendarDate(end)) {
    throw new Error("validateQuoteDeliveryWindow: end must be a real, existing ISO calendar date (YYYY-MM-DD)");
  }
  if (start > end) {
    throw new Error("validateQuoteDeliveryWindow: start must be on or before end");
  }
  return { start, end };
}

// ---------------------------------------------------------------------
// Request revision content
// ---------------------------------------------------------------------

export interface QuoteRequestRevisionInput {
  /** Free text, farmer-facing product name — deliberately not
   * constrained to `nutrients.ts`'s `PRODUCTS` catalogue (brief:
   * "Provide a manual quantity route: farmers can request known needs
   * even if modelled requirements are unavailable"). Trimmed,
   * non-empty. */
  product: string;
  quantity: number;
  unit: QuoteRequestUnit;
  /** Optional packaging detail (e.g. "25kg bags", "bulk bag") — never
   * itself converted to a quantity; see `quoteQuantityToKgIfKnown`. */
  packaging?: string;
  quantityBasis: QuoteQuantityBasis;
  /** Present if and only if `quantityBasis === "estimated"`. */
  estimateSnapshot?: QuoteRequestEstimateSnapshot;
  deliveryWindow: QuoteDeliveryWindow;
  /**
   * Brief: "record the notice version and affirmative request action"
   * for the pre-submit disclosure ("Farm Return will seek a supplier
   * quote for these items. This is not an order and no payment is
   * taken."). `disclosureVersion` identifies exactly which wording of
   * that notice was shown — a future change to the notice text gets a
   * new version string, never silently reinterpreting what an earlier
   * farmer actually agreed to. `disclosureAcceptedAt` is the real
   * moment the farmer ticked the affirmative checkbox (captured
   * client-side at that exact interaction, not backdated to submission
   * time) — never in the future.
   */
  disclosureVersion: string;
  disclosureAcceptedAt: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates one request revision's full content — throws with a clear
 * message on any violation (the same fail-closed, throwing convention
 * `validateFertiliserPlanEdits` already established for this kind of
 * narrow, server-recomputed input). Never coerces a negative/non-finite
 * quantity, never accepts an unlisted unit, never silently trims an
 * empty product name into "unknown".
 */
export function validateQuoteRequestRevisionInput(input: unknown): QuoteRequestRevisionInput {
  if (typeof input !== "object" || input === null) {
    throw new Error("validateQuoteRequestRevisionInput: expected an object");
  }
  const raw = input as Record<string, unknown>;

  const product = typeof raw.product === "string" ? raw.product.trim() : "";
  if (product.length === 0) {
    throw new Error("validateQuoteRequestRevisionInput: product must be a non-empty string");
  }

  if (!isFiniteNumber(raw.quantity) || raw.quantity <= 0) {
    throw new Error("validateQuoteRequestRevisionInput: quantity must be a real, finite, positive number");
  }

  if (typeof raw.unit !== "string" || !(QUOTE_REQUEST_UNITS as readonly string[]).includes(raw.unit)) {
    throw new Error(`validateQuoteRequestRevisionInput: unit must be one of ${QUOTE_REQUEST_UNITS.join(", ")}`);
  }
  const unit = raw.unit as QuoteRequestUnit;

  let packaging: string | undefined;
  if (raw.packaging !== undefined) {
    if (typeof raw.packaging !== "string" || raw.packaging.trim().length === 0) {
      throw new Error("validateQuoteRequestRevisionInput: packaging, if present, must be a non-empty string");
    }
    packaging = raw.packaging.trim();
  }

  if (raw.quantityBasis !== "estimated" && raw.quantityBasis !== "farmer_entered") {
    throw new Error('validateQuoteRequestRevisionInput: quantityBasis must be "estimated" or "farmer_entered"');
  }
  const quantityBasis = raw.quantityBasis;

  let estimateSnapshot: QuoteRequestEstimateSnapshot | undefined;
  if (quantityBasis === "estimated") {
    if (typeof raw.estimateSnapshot !== "object" || raw.estimateSnapshot === null) {
      throw new Error('validateQuoteRequestRevisionInput: estimateSnapshot is required when quantityBasis is "estimated"');
    }
    const snap = raw.estimateSnapshot as Record<string, unknown>;
    if (!isFiniteNumber(snap.remainingRequirementKg) || snap.remainingRequirementKg < 0) {
      throw new Error("validateQuoteRequestRevisionInput: estimateSnapshot.remainingRequirementKg must be a real, finite, non-negative number");
    }
    if (typeof snap.truncated !== "boolean") {
      throw new Error("validateQuoteRequestRevisionInput: estimateSnapshot.truncated must be a boolean");
    }
    if (!isFiniteNumber(snap.applicationsWithUnknownComposition) || snap.applicationsWithUnknownComposition < 0) {
      throw new Error("validateQuoteRequestRevisionInput: estimateSnapshot.applicationsWithUnknownComposition must be a real, finite, non-negative number");
    }
    if (!isFiniteNumber(snap.fieldsWithBlockedEvidence) || snap.fieldsWithBlockedEvidence < 0) {
      throw new Error("validateQuoteRequestRevisionInput: estimateSnapshot.fieldsWithBlockedEvidence must be a real, finite, non-negative number");
    }
    if (typeof snap.asOf !== "string" || !isValidIsoUtcDateTime(snap.asOf)) {
      throw new Error("validateQuoteRequestRevisionInput: estimateSnapshot.asOf must be a real ISO UTC datetime");
    }
    estimateSnapshot = {
      remainingRequirementKg: snap.remainingRequirementKg,
      truncated: snap.truncated,
      applicationsWithUnknownComposition: snap.applicationsWithUnknownComposition,
      fieldsWithBlockedEvidence: snap.fieldsWithBlockedEvidence,
      asOf: snap.asOf,
    };
  } else if (raw.estimateSnapshot !== undefined) {
    throw new Error('validateQuoteRequestRevisionInput: estimateSnapshot must be omitted when quantityBasis is "farmer_entered"');
  }

  const deliveryWindow = validateQuoteDeliveryWindow(raw.deliveryWindow);

  if (typeof raw.disclosureVersion !== "string" || raw.disclosureVersion.trim().length === 0) {
    throw new Error("validateQuoteRequestRevisionInput: disclosureVersion must be a non-empty string");
  }
  if (typeof raw.disclosureAcceptedAt !== "string" || !isValidIsoUtcDateTime(raw.disclosureAcceptedAt)) {
    throw new Error("validateQuoteRequestRevisionInput: disclosureAcceptedAt must be a real ISO UTC datetime");
  }
  if (new Date(raw.disclosureAcceptedAt).getTime() > Date.now() + 5 * 60 * 1000) {
    throw new Error("validateQuoteRequestRevisionInput: disclosureAcceptedAt cannot be materially in the future");
  }

  return {
    product,
    quantity: raw.quantity,
    unit,
    ...(packaging !== undefined ? { packaging } : {}),
    quantityBasis,
    ...(estimateSnapshot !== undefined ? { estimateSnapshot } : {}),
    deliveryWindow,
    disclosureVersion: raw.disclosureVersion,
    disclosureAcceptedAt: raw.disclosureAcceptedAt,
  };
}

// ---------------------------------------------------------------------
// Revisioning
// ---------------------------------------------------------------------

/**
 * The next revision number for a request — 1 for a brand-new request,
 * otherwise one past the current highest. Pure arithmetic; the
 * persistence layer is responsible for the actual atomic
 * read-current/insert-next transaction (brief: revisions are immutable,
 * a request's `current_revision_id` moves forward, never rewritten).
 */
export function nextQuoteRequestRevisionNumber(currentRevisionNumber: number | null): number {
  return (currentRevisionNumber ?? 0) + 1;
}

// ---------------------------------------------------------------------
// Farmer-visible status (derived, never client-set)
// ---------------------------------------------------------------------

/**
 * Checkpoint 1's own real scope only — `requested`/`withdrawn`, the two
 * states this checkpoint's tables can actually back with a real fact.
 * The brief's fuller status list (Being quoted / Quote available /
 * Interested / Declined / Expired / Unable to quote) depends on
 * Checkpoint 2/3's enquiry/offer tables, which don't exist yet — this
 * function is extended, not reinvented, once those real events exist,
 * per the same "derive from authoritative workflow events, never a
 * client-set value" discipline.
 */
export type QuoteRequestFarmerStatus = "requested" | "withdrawn";

export function deriveQuoteRequestFarmerStatus(withdrawnAt: string | null): QuoteRequestFarmerStatus {
  return withdrawnAt !== null ? "withdrawn" : "requested";
}

// ---------------------------------------------------------------------
// Operator demand inbox — compatible grouping (Q05/Q06)
// ---------------------------------------------------------------------

export interface QuoteDemandLine {
  requestId: string;
  revisionId: string;
  farmId: string;
  product: string;
  quantity: number;
  unit: QuoteRequestUnit;
  deliveryWindow: QuoteDeliveryWindow;
}

export interface QuoteDemandUnresolvedLine {
  requestId: string;
  revisionId: string;
  farmId: string;
  quantity: number;
  unit: QuoteRequestUnit;
}

export interface QuoteDemandGroup {
  product: string;
  /** The exact delivery window every line in this group shares — see
   * this function's own doc comment for why "shares" means an identical
   * window, not merely an overlapping one. */
  deliveryWindow: QuoteDeliveryWindow;
  /** Real total across every line in this group whose unit resolves to
   * a known kg equivalent — converted once, summed once, never counting
   * the same underlying line twice (brief Q06). */
  resolvedTotalKg: number;
  resolvedLineIds: string[];
  /** Lines for this same product/window whose unit has no known kg
   * equivalent (e.g. `bags`, no verified pack weight) — kept out of
   * `resolvedTotalKg` rather than guessed into it, and never silently
   * dropped (brief Q06: "unknown bag weight blocks conversion"). */
  unresolvedLines: QuoteDemandUnresolvedLine[];
}

/**
 * Groups request-revision lines by product *and* delivery window —
 * "compatible" here means an exact product-string match (the same
 * exact-match discipline `aggregateFarmFertiliserDemand` already uses;
 * no grade/spec matching or cross-product substitution) *and* an
 * identical delivery window, matching Checkpoint 1's own scope
 * (`quote-workflow-implementation-plan.md`: "compatible product/unit/
 * date grouping only, no routing or purchasing engine").
 *
 * **Deliberately exact-window, not overlapping-window** (Codex audit
 * HIGH, Checkpoint 1 review, `20260911T115909Z.md` — the first version
 * of this function ignored delivery windows entirely, silently
 * combining requests with non-overlapping windows into one total).
 * Clustering by *overlap* instead would need transitive interval
 * merging (A overlaps B, B overlaps C ⇒ group {A,B,C}), which can
 * produce a group whose members share no common date at all (A∩C
 * empty) — exactly the kind of invented scheduling/routing logic the
 * brief warns against ("Do not invent a radius... or build route
 * optimisation"). Exact-window matching is the smallest correct rule
 * that can never merge two requests with no real common delivery date range;
 * the operator's own explicit request selection (Checkpoint 2's "select
 * requests explicitly to create a draft batch") is where genuinely
 * near-but-not-identical windows get a human judgement call, not an
 * invented algorithm here. Delivery-*area* compatibility is out of
 * Checkpoint 1's scope entirely (brief: "operator-assigned delivery
 * areas... initially" — a Checkpoint 2 concept with no data source yet).
 */
export function groupCompatibleQuoteDemand(lines: readonly QuoteDemandLine[]): QuoteDemandGroup[] {
  const byKey = new Map<string, QuoteDemandGroup>();
  for (const line of lines) {
    const key = `${line.product} ${line.deliveryWindow.start} ${line.deliveryWindow.end}`;
    let group = byKey.get(key);
    if (!group) {
      group = { product: line.product, deliveryWindow: line.deliveryWindow, resolvedTotalKg: 0, resolvedLineIds: [], unresolvedLines: [] };
      byKey.set(key, group);
    }
    const kg = quoteQuantityToKgIfKnown(line.quantity, line.unit);
    if (kg === null) {
      group.unresolvedLines.push({ requestId: line.requestId, revisionId: line.revisionId, farmId: line.farmId, quantity: line.quantity, unit: line.unit });
    } else {
      group.resolvedTotalKg += kg;
      group.resolvedLineIds.push(line.revisionId);
    }
  }
  return Array.from(byKey.values());
}
