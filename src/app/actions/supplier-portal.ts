"use server";

/**
 * Supplier Portal — supplier-facing Server Actions. Every action is an
 * untrusted entry point (`node_modules/next/dist/docs/01-app/02-guides/
 * server-actions.md` "Security"): it first resolves the caller's own
 * supplier membership server-side, accepts only references (route/quote
 * ids) plus the change itself, validates the change with the pure
 * domain module, and never accepts a supplier id, farm id or total from
 * the client — any such field in the payload is ignored. The database
 * RPCs repeat the membership and ownership checks at the write boundary.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  supplierQuoteSubmissionIssues,
  validateSupplierQuoteDraft,
  SUPPLIER_QUOTE_TEXT_LIMITS,
  type SupplierQuoteIssue,
} from "@/domain/supplier-quote";
import { IRISH_COUNTIES } from "@/lib/irish-counties";
import {
  SupplierPortalError,
  declineMySupplierRfq,
  discardMySupplierQuoteDraft,
  getMySupplierPortalContext,
  saveMySupplierQuoteDraft,
  submitMySupplierQuote,
  updateMySupplierPortalSettings,
  withdrawMySupplierQuote,
  type SupplierPortalContext,
  type SupplierPortalErrorCode,
  type SupplierQuoteVersionRef,
} from "@/lib/farm-data/supplier-portal";
import { supplierPortalToday } from "@/orchestration/supplier-portal";

export type SupplierPortalActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: SupplierPortalErrorCode; message: string; issues?: SupplierQuoteIssue[]; latest?: SupplierQuoteVersionRef };

const USER_MESSAGES: Record<SupplierPortalErrorCode, string> = {
  FORBIDDEN: "This account does not have supplier access for that action.",
  NOT_FOUND: "That RFQ or quote was not found for your supplier account.",
  STALE: "This quote was changed elsewhere. Reload the page before trying again.",
  CONFLICT: "That action is not possible in the RFQ's current state.",
  INVALID: "Some values are not valid.",
  INCOMPLETE: "The quote is not complete yet.",
  REQUEST_REVISED: "The farmer changed this request. Review the draft against the new request and save it again.",
  UNAVAILABLE: "The supplier portal is not available on this database yet.",
};

function failure<T>(error: unknown): SupplierPortalActionResult<T> {
  if (error instanceof SupplierPortalError) {
    const detail = error.code === "CONFLICT" || error.code === "INCOMPLETE" || error.code === "INVALID" ? error.message : USER_MESSAGES[error.code];
    return { ok: false, code: error.code, message: detail || USER_MESSAGES[error.code] };
  }
  console.error("[supplier-portal action] unexpected failure:", error);
  return { ok: false, code: "CONFLICT", message: "Something went wrong. Please try again." };
}

async function requireSupplier(): Promise<SupplierPortalContext> {
  const context = await getMySupplierPortalContext();
  if (!context) throw new SupplierPortalError("FORBIDDEN", USER_MESSAGES.FORBIDDEN);
  return context;
}

const uuid = z.string().uuid();
const version = z.number().int().min(1);

function revalidateSupplierPortal(): void {
  revalidatePath("/supplier", "layout");
}

export async function getSupplierPortalContextAction(): Promise<SupplierPortalContext | null> {
  return getMySupplierPortalContext();
}

// ---------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------

const saveRequestSchema = z.object({
  routeId: uuid,
  quoteId: uuid.nullable(),
  expectedVersion: version.nullable(),
  draft: z.unknown(),
});

/** Saves (creates or replaces) the caller's draft quote on one RFQ. */
export async function saveSupplierQuoteDraftAction(input: unknown): Promise<SupplierPortalActionResult<SupplierQuoteVersionRef>> {
  try {
    await requireSupplier();
    const request = saveRequestSchema.safeParse(input);
    if (!request.success || (request.data.quoteId === null) !== (request.data.expectedVersion === null)) {
      return { ok: false, code: "INVALID", message: "Malformed quote request." };
    }
    const draft = validateSupplierQuoteDraft(request.data.draft);
    if (!draft.ok) return { ok: false, code: "INVALID", message: USER_MESSAGES.INVALID, issues: draft.issues };
    const { routeId, quoteId, expectedVersion } = request.data;
    const saved = await saveMySupplierQuoteDraft(routeId, quoteId && expectedVersion ? { quoteId, expectedVersion } : null, draft.value);
    revalidateSupplierPortal();
    return { ok: true, value: saved };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Saves the draft, then submits it. Completeness is checked before any
 * write so a supplier sees every missing field at once; the database
 * re-checks at submission. If the save succeeds and the submit is then
 * rejected, the new draft version is returned as `latest` so the editor
 * can continue without a reload.
 */
export async function submitSupplierQuoteAction(input: unknown): Promise<SupplierPortalActionResult<SupplierQuoteVersionRef>> {
  try {
    await requireSupplier();
    const request = saveRequestSchema.safeParse(input);
    if (!request.success || (request.data.quoteId === null) !== (request.data.expectedVersion === null)) {
      return { ok: false, code: "INVALID", message: "Malformed quote request." };
    }
    const draft = validateSupplierQuoteDraft(request.data.draft);
    if (!draft.ok) return { ok: false, code: "INVALID", message: USER_MESSAGES.INVALID, issues: draft.issues };
    const incomplete = supplierQuoteSubmissionIssues(draft.value, supplierPortalToday());
    if (incomplete.length > 0) return { ok: false, code: "INCOMPLETE", message: USER_MESSAGES.INCOMPLETE, issues: incomplete };

    const { routeId, quoteId, expectedVersion } = request.data;
    const saved = await saveMySupplierQuoteDraft(routeId, quoteId && expectedVersion ? { quoteId, expectedVersion } : null, draft.value);
    revalidateSupplierPortal();
    try {
      const submitted = await submitMySupplierQuote(saved.quoteId, saved.version);
      return { ok: true, value: submitted };
    } catch (error) {
      const result = failure<SupplierQuoteVersionRef>(error);
      return result.ok ? result : { ...result, latest: saved };
    }
  } catch (error) {
    return failure(error);
  }
}

const quoteRefSchema = z.object({ quoteId: uuid, expectedVersion: version });
const reasonSchema = z.string().max(SUPPLIER_QUOTE_TEXT_LIMITS.withdrawReason).nullable().optional();

export async function withdrawSupplierQuoteAction(input: unknown): Promise<SupplierPortalActionResult<null>> {
  try {
    await requireSupplier();
    const request = quoteRefSchema.extend({ reason: reasonSchema }).safeParse(input);
    if (!request.success) return { ok: false, code: "INVALID", message: "Malformed withdraw request." };
    await withdrawMySupplierQuote(request.data.quoteId, request.data.expectedVersion, request.data.reason?.trim() || null);
    revalidateSupplierPortal();
    return { ok: true, value: null };
  } catch (error) {
    return failure(error);
  }
}

export async function discardSupplierQuoteDraftAction(input: unknown): Promise<SupplierPortalActionResult<null>> {
  try {
    await requireSupplier();
    const request = quoteRefSchema.safeParse(input);
    if (!request.success) return { ok: false, code: "INVALID", message: "Malformed discard request." };
    await discardMySupplierQuoteDraft(request.data.quoteId, request.data.expectedVersion);
    revalidateSupplierPortal();
    return { ok: true, value: null };
  } catch (error) {
    return failure(error);
  }
}

export async function declineSupplierRfqAction(input: unknown): Promise<SupplierPortalActionResult<null>> {
  try {
    await requireSupplier();
    const request = z.object({ routeId: uuid, reason: z.string().max(SUPPLIER_QUOTE_TEXT_LIMITS.declineReason).nullable().optional() }).safeParse(input);
    if (!request.success) return { ok: false, code: "INVALID", message: "Malformed decline request." };
    await declineMySupplierRfq(request.data.routeId, request.data.reason?.trim() || null);
    revalidateSupplierPortal();
    return { ok: true, value: null };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

const COUNTY_NAMES = new Set(IRISH_COUNTIES.map((county) => county.name));
const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value && value.trim() !== "" ? value.trim() : null));

const settingsSchema = z.object({
  contactEmail: optionalTrimmed(254).refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), "Enter a valid email address."),
  contactPhone: optionalTrimmed(40),
  serviceCounties: z.array(z.string()).max(40).refine((counties) => counties.every((county) => COUNTY_NAMES.has(county)), "Choose counties from the list."),
  defaultQuoteValidityDays: z.number().int().min(1).max(90).nullable(),
  quoteTerms: optionalTrimmed(2000),
});

export async function updateSupplierSettingsAction(input: unknown): Promise<SupplierPortalActionResult<null>> {
  try {
    const context = await requireSupplier();
    if (context.role !== "admin") return { ok: false, code: "FORBIDDEN", message: "Only a supplier admin can change settings." };
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        code: "INVALID",
        message: USER_MESSAGES.INVALID,
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      };
    }
    await updateMySupplierPortalSettings({ ...parsed.data, serviceCounties: [...new Set(parsed.data.serviceCounties)].sort() });
    revalidateSupplierPortal();
    return { ok: true, value: null };
  } catch (error) {
    return failure(error);
  }
}
