/**
 * Managed Quote Pilot, Checkpoint 1 — orchestration layer. All
 * arithmetic/validation lives in the pure `src/domain/quote-request.ts`;
 * this module performs the real farm-scoped I/O
 * (`src/lib/farm-data/quote-requests.ts`, `farm-delivery-details.ts`)
 * and reuses the existing fertiliser-demand action for prefill — it
 * never recomputes that arithmetic itself (`AGENTS.md`'s "never
 * duplicate a domain/farm-data calculation" rule).
 */
import "server-only";
import {
  validateQuoteDeliveryWindow,
  validateQuoteRequestRevisionInput,
  groupCompatibleQuoteDemand,
  type QuoteDemandGroup,
  type QuoteRequestEstimateSnapshot,
} from "@/domain/quote-request";
import { validateFarmDeliveryDetailsInput, type FarmDeliveryDetailsInput } from "@/lib/farm-data/farm-delivery-details";
import {
  listQuoteRequestsForFarm,
  listQuoteRequestsForOperatorInbox,
  reviseQuoteRequest,
  submitQuoteRequest,
  withdrawQuoteRequest,
  type QuoteRequest,
  type SubmitOrReviseQuoteRequestResult,
} from "@/lib/farm-data/quote-requests";
import { getFarmFertiliserDemandAction, getFarmLimeRequirementAction, type FarmFertiliserDemandActionResult } from "@/app/actions/fertiliser-plan";

/**
 * A single farm-wide fertiliser demand line, shaped for the "Request a
 * quote" prefill — reuses `getFarmFertiliserDemandAction` verbatim
 * (`FarmInputDemand`, the frozen `fertiliser-plan.ts` domain contract's
 * own real output) and carries its real uncertainty flags through,
 * never presenting a partial total as exact
 * (`quote-workflow-repository-review.md` R2).
 */
export interface QuoteRequestPrefillOption {
  product: string;
  remainingRequirementKg: number;
  /** True if the *farm-wide* demand read this figure depends on hit its
   * own row cap, or a real confirmed application's quantity could not be
   * resolved to kg, or a field was excluded for missing evidence — any
   * one of these means this figure may understate the truth. Sourced
   * from `FarmFertiliserDemandActionResult`'s own three separate flags,
   * combined here only for prefill-banner purposes; the individual
   * counts remain available on `demandContext` for a fuller disclosure. */
  mayUnderstate: boolean;
}

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint C — the real
 * farm-wide lime requirement, reshaped for the same prefill purpose.
 * Deliberately NOT folded into `QuoteRequestPrefillOption`/
 * `estimateSnapshot` above: `QuoteRequestEstimateSnapshot`'s shape
 * (`remainingRequirementKg`, `applicationsWithUnknownComposition`, …)
 * is specific to a real `FarmInputDemand` product row
 * (`getFarmFertiliserDemandAction`), which lime is not — reusing it for
 * a structurally different real figure (tonnes, no application-level
 * concept at all) would be exactly the "fabricated provenance" shape
 * Checkpoint 1's own Codex audit (round 1, `20260911T115909Z.md`)
 * closed for the fertiliser path. `RequestQuoteSheet.tsx` shows this
 * figure as a purely informational banner (Codex audit HIGH, Checkpoint
 * C round 1: an earlier version auto-quick-filled the manual fields
 * from it, which mislabeled a real, calculated number as if the farmer
 * had typed it themselves) — a farmer requesting a lime quote types the
 * figure into the existing manual/`farmer_entered` fields themselves,
 * at which point that provenance label is genuinely, unambiguously
 * true. */
export interface QuoteRequestLimeOption {
  farmTotalTonnes: number;
  /** True when at least one field has no real laboratory lime figure on
   * file — the total may understate the true farm-wide requirement. */
  fieldsWithoutLimeEvidence: number;
}

export interface QuoteRequestPrefillContext {
  options: QuoteRequestPrefillOption[];
  demandContext: FarmFertiliserDemandActionResult;
  /** `undefined` only when the farm has no real lime evidence on file
   * at all (`farmTotalTonnes === 0` and no field has any) — never a
   * fabricated zero-tonne option. */
  limeOption?: QuoteRequestLimeOption;
  asOf: string;
}

/** Real farm-wide fertiliser demand (+ lime), reshaped for the request
 * form's "Request a quote" entry point. Returns an empty `options`
 * array (never a fabricated row) if the farm has no real recommended
 * fertiliser demand yet — the farmer's own manual/farmer-entered route
 * remains available regardless. */
export async function getQuoteRequestPrefillContext(): Promise<QuoteRequestPrefillContext> {
  const [demandContext, limeRequirement] = await Promise.all([getFarmFertiliserDemandAction(), getFarmLimeRequirementAction()]);
  const asOf = new Date().toISOString();
  const options: QuoteRequestPrefillOption[] = demandContext.demand
    .filter((d) => d.remainingRequirementKg > 0)
    .map((d) => ({
      product: d.product,
      remainingRequirementKg: d.remainingRequirementKg,
      mayUnderstate: demandContext.truncated || demandContext.applicationsWithUnknownComposition > 0 || demandContext.fieldsWithBlockedEvidence > 0,
    }));
  const limeOption: QuoteRequestLimeOption | undefined =
    limeRequirement.farmTotalTonnes > 0 ? { farmTotalTonnes: limeRequirement.farmTotalTonnes, fieldsWithoutLimeEvidence: limeRequirement.fieldsWithoutLimeEvidence } : undefined;
  return { options, demandContext, limeOption, asOf };
}

export interface QuoteRequestFormInput {
  product: string;
  quantity: number;
  unit: "kg" | "tonnes" | "bags";
  packaging?: string;
  quantityBasis: "estimated" | "farmer_entered";
  deliveryWindow: { start: string; end: string };
  delivery: FarmDeliveryDetailsInput;
  /** The pre-submit disclosure's own notice version and the real moment
   * the farmer ticked the affirmative-acceptance checkbox — captured
   * client-side at that exact interaction (`RequestQuoteSheet`'s own
   * doc comment), passed through unmodified to the RPC boundary, which
   * re-validates both are present and not materially future-dated. */
  disclosureVersion: string;
  disclosureAcceptedAt: string;
}

/**
 * Codex audit HIGH (Checkpoint 1 review, `20260911T115909Z.md`): the
 * first version of this function accepted a caller-supplied
 * `estimateRemainingRequirementKg` and persisted it verbatim as if it
 * were a server-derived figure — a direct caller could have stored any
 * finite number as an "estimated" quantity with fabricated provenance
 * metadata. Fixed by removing that field from `QuoteRequestFormInput`
 * entirely: when `quantityBasis` is `"estimated"`, this function looks
 * up the caller's own claimed `product` in the *current, real*
 * `getFarmFertiliserDemandAction` result itself and refuses the request
 * if that product has no real demand row at all — the same
 * "server-recompute, never trust the client" discipline
 * `submitPromptDecisionAction` already established elsewhere in this
 * app.
 */
function buildRpcInput(input: QuoteRequestFormInput, demandContext: FarmFertiliserDemandActionResult | null, asOf: string) {
  let estimateSnapshot: QuoteRequestEstimateSnapshot | undefined;
  if (input.quantityBasis === "estimated") {
    if (!demandContext) {
      throw new Error('buildRpcInput: quantityBasis is "estimated" but no demand context was supplied');
    }
    const matched = demandContext.demand.find((d) => d.product === input.product);
    if (!matched) {
      throw new Error(`buildRpcInput: quantityBasis is "estimated" but no real farm-wide demand exists for product "${input.product}" — the farmer-entered route must be used instead`);
    }
    estimateSnapshot = {
      remainingRequirementKg: matched.remainingRequirementKg,
      truncated: demandContext.truncated,
      applicationsWithUnknownComposition: demandContext.applicationsWithUnknownComposition,
      fieldsWithBlockedEvidence: demandContext.fieldsWithBlockedEvidence,
      asOf,
    };
  } else {
    estimateSnapshot = undefined;
  }

  const validated = validateQuoteRequestRevisionInput({
    product: input.product,
    quantity: input.quantity,
    unit: input.unit,
    packaging: input.packaging,
    quantityBasis: input.quantityBasis,
    estimateSnapshot,
    deliveryWindow: input.deliveryWindow,
    disclosureVersion: input.disclosureVersion,
    disclosureAcceptedAt: input.disclosureAcceptedAt,
  });
  const delivery = validateFarmDeliveryDetailsInput(input.delivery);
  return { ...validated, delivery };
}

/**
 * Submits a brand-new quote request. `idempotencyKey` must be a real,
 * client-generated key stable across a retry of the *same* submit
 * attempt (e.g. generated once when the confirmation screen is shown,
 * not regenerated per network attempt) — the RPC itself enforces the
 * actual idempotency guarantee (brief Q02); this parameter only carries
 * the key the client already committed to.
 */
export async function submitQuoteRequestOrchestrated(idempotencyKey: string, input: QuoteRequestFormInput): Promise<SubmitOrReviseQuoteRequestResult> {
  const demandContext = input.quantityBasis === "estimated" ? await getFarmFertiliserDemandAction() : null;
  const rpcInput = buildRpcInput(input, demandContext, new Date().toISOString());
  return submitQuoteRequest(idempotencyKey, rpcInput);
}

export async function reviseQuoteRequestOrchestrated(
  requestId: string,
  expectedRevisionNumber: number,
  input: QuoteRequestFormInput,
): Promise<SubmitOrReviseQuoteRequestResult> {
  const demandContext = input.quantityBasis === "estimated" ? await getFarmFertiliserDemandAction() : null;
  const rpcInput = buildRpcInput(input, demandContext, new Date().toISOString());
  return reviseQuoteRequest(requestId, expectedRevisionNumber, rpcInput);
}

export async function withdrawQuoteRequestOrchestrated(requestId: string): Promise<void> {
  await withdrawQuoteRequest(requestId);
}

export async function listMyQuoteRequests(farmId: string): Promise<QuoteRequest[]> {
  return listQuoteRequestsForFarm(farmId);
}

export interface OperatorDemandInbox {
  requests: QuoteRequest[];
  groups: QuoteDemandGroup[];
}

/**
 * Codex audit HIGH (Checkpoint 1 verification review,
 * `20260911T121215Z.md`): `submitQuoteRequestOrchestrated`'s own
 * server-side lookup only closes the fabricated-provenance path for
 * requests submitted through this app's own Server Action — the RPC
 * itself must still accept a caller-supplied `estimate_snapshot` JSONB
 * blob at the database boundary, because the real farm-wide demand
 * calculation (`getFarmFertiliserDemandAction`, Green Book/NAP
 * agronomic tables) is TypeScript domain logic this SQL layer cannot
 * reimplement without duplicating a frozen domain calculation into a
 * second, competing layer — exactly what `AGENTS.md` separately
 * forbids. This is the same structural, disclosed limit
 * `20260829010000_decisions_jobs_client_access.sql`'s own
 * `insert_decision`'s comment already names for this exact class of
 * problem ("does not and cannot verify a value's truthfulness"), not a
 * new gap unique to this feature. Rather than pretend the database can
 * verify a number it structurally cannot, this strips the entire
 * `estimateSnapshot` from the operator's own view before it reaches any
 * caller here — the actual exploitable harm (a fabricated number
 * misleading an *operator's* real business judgement about aggregate
 * demand) is closed by never showing that farmer-supplied number to the
 * operator at all; `quantityBasis` alone (a label, not a number) is
 * still visible. A farmer reading their own possibly-self-supplied
 * figure back at themselves (`listMyQuoteRequests`, unaffected by this
 * function) is not a security concern — it is their own data.
 */
function sanitiseQuoteRequestForOperator(request: QuoteRequest): QuoteRequest {
  return { ...request, currentRevision: { ...request.currentRevision, estimateSnapshot: null } };
}

/** The operator's demand inbox — every farm's real submitted requests,
 * grouped by compatible product/unit/delivery-window (brief: "compatible
 * product/unit/date grouping only, no routing or purchasing engine" —
 * Checkpoint 1's own explicit scope). A withdrawn request is excluded
 * from grouping (it is not real outstanding demand) but still returned
 * in `requests` so the operator can see it was withdrawn, not silently
 * vanish. */
export async function getOperatorDemandInbox(): Promise<OperatorDemandInbox> {
  const rawRequests = await listQuoteRequestsForOperatorInbox();
  const requests = rawRequests.map(sanitiseQuoteRequestForOperator);
  const activeLines = requests
    .filter((r) => r.status !== "withdrawn")
    .map((r) => ({
      requestId: r.id,
      revisionId: r.currentRevision.id,
      farmId: r.farmId,
      product: r.currentRevision.product,
      quantity: r.currentRevision.quantity,
      unit: r.currentRevision.unit,
      deliveryWindow: r.currentRevision.deliveryWindow,
    }));
  return { requests, groups: groupCompatibleQuoteDemand(activeLines) };
}

export { validateQuoteDeliveryWindow };
