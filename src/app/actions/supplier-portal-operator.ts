"use server";

/**
 * Supplier Portal — operator-only Server Actions: create a supplier,
 * link an existing account to it, and route a real farmer quote request
 * to it. Every action checks the existing `quote_operators` allow-list
 * (`isQuoteOperatorForCurrentUser`) first; the RPCs re-check it.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isQuoteOperatorForCurrentUser } from "@/lib/farm-data/quote-operators";
import {
  SupplierPortalError,
  getSupplierPortalOperatorOverview,
  operatorCreateSupplier,
  operatorGrantSupplierMember,
  operatorRevokeSupplierMember,
  operatorRouteRequestToSupplier,
  type SupplierPortalOperatorOverview,
} from "@/lib/farm-data/supplier-portal";
import type { SupplierPortalActionResult } from "./supplier-portal";

async function requireOperator(): Promise<void> {
  if (!(await isQuoteOperatorForCurrentUser())) {
    throw new SupplierPortalError("FORBIDDEN", "The current session is not an authorised quote operator.");
  }
}

function failure<T>(error: unknown): SupplierPortalActionResult<T> {
  if (error instanceof SupplierPortalError) return { ok: false, code: error.code, message: error.message };
  console.error("[supplier-portal operator action] unexpected failure:", error);
  return { ok: false, code: "CONFLICT", message: "Something went wrong. Please try again." };
}

const uuid = z.string().uuid();

function revalidateOperator(): void {
  revalidatePath("/operator/suppliers");
  revalidatePath("/supplier", "layout");
}

export async function getSupplierPortalOperatorOverviewAction(): Promise<SupplierPortalOperatorOverview> {
  await requireOperator();
  return getSupplierPortalOperatorOverview();
}

export async function createSupplierAction(input: unknown): Promise<SupplierPortalActionResult<string>> {
  try {
    await requireOperator();
    const parsed = z
      .object({ displayName: z.string().trim().min(1).max(120), contactEmail: z.string().trim().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/).nullable() })
      .safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID", message: "Enter a supplier name (and a valid email, if any)." };
    const id = await operatorCreateSupplier(parsed.data.displayName, parsed.data.contactEmail);
    revalidateOperator();
    return { ok: true, value: id };
  } catch (error) {
    return failure(error);
  }
}

export async function grantSupplierMemberAction(input: unknown): Promise<SupplierPortalActionResult<null>> {
  try {
    await requireOperator();
    const parsed = z
      .object({ supplierId: uuid, userEmail: z.string().trim().min(3).max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/), role: z.enum(["admin", "member"]) })
      .safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID", message: "Choose a supplier, a valid account email and a role." };
    await operatorGrantSupplierMember(parsed.data.supplierId, parsed.data.userEmail, parsed.data.role);
    revalidateOperator();
    return { ok: true, value: null };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeSupplierMemberAction(input: unknown): Promise<SupplierPortalActionResult<null>> {
  try {
    await requireOperator();
    const parsed = z.object({ supplierId: uuid, userId: uuid }).safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID", message: "Malformed revoke request." };
    await operatorRevokeSupplierMember(parsed.data.supplierId, parsed.data.userId);
    revalidateOperator();
    return { ok: true, value: null };
  } catch (error) {
    return failure(error);
  }
}

export async function routeQuoteRequestToSupplierAction(input: unknown): Promise<SupplierPortalActionResult<string>> {
  try {
    await requireOperator();
    const parsed = z.object({ requestId: uuid, supplierId: uuid }).safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID", message: "Choose a request and a supplier." };
    const routeId = await operatorRouteRequestToSupplier(parsed.data.requestId, parsed.data.supplierId);
    revalidateOperator();
    return { ok: true, value: routeId };
  } catch (error) {
    return failure(error);
  }
}
