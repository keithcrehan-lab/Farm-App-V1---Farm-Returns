import "server-only";

import { SupplierPortalError, getMySupplierPortalContext, type SupplierPortalContext } from "@/lib/farm-data/supplier-portal";

export type SupplierLoad<T> = { state: "ready"; value: T } | { state: "no-access" } | { state: "not-found" } | { state: "unavailable"; message: string };

/** Runs a supplier-scoped read and maps the expected failure modes to
 * honest page states instead of a crash or a fabricated empty list. */
export async function loadForSupplier<T>(read: () => Promise<T>): Promise<SupplierLoad<T>> {
  try {
    return { state: "ready", value: await read() };
  } catch (error) {
    if (error instanceof SupplierPortalError) {
      if (error.code === "FORBIDDEN") return { state: "no-access" };
      if (error.code === "NOT_FOUND") return { state: "not-found" };
      if (error.code === "UNAVAILABLE") return { state: "unavailable", message: error.message };
    }
    console.error("[supplier portal] read failed:", error);
    return { state: "unavailable", message: "The supplier portal isn't available right now — please try again shortly." };
  }
}

export async function loadSupplierContext(): Promise<SupplierLoad<SupplierPortalContext>> {
  const result = await loadForSupplier(getMySupplierPortalContext);
  if (result.state === "ready" && result.value === null) return { state: "no-access" };
  return result as SupplierLoad<SupplierPortalContext>;
}
