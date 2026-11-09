"use server";

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import {
  createMedicinePurchase,
  ensureMedicineProductLink,
  findMedicineProductLink,
  listMedicinePurchases,
  type MedicinePurchase,
} from "@/lib/farm-data/medicine-purchases";
import { parseMedicinePackScan, type MedicinePackScan } from "@/lib/medicines/gs1";
import { findHpraProduct, requiresPrescription, searchHpraProducts, type HpraVetProduct } from "@/lib/medicines/hpra-products";
import { validateMedicinePurchase, type MedicinePurchaseInput } from "@/lib/medicines/purchase-form";

export interface MedicineProductChoice {
  licenceNumber: string;
  name: string;
  holder: string;
  legalStatus: string;
  species: string[];
  dosageForm: string;
  prescription: boolean;
}

const toChoice = (p: HpraVetProduct): MedicineProductChoice => ({
  licenceNumber: p.licenceNumber,
  name: p.name,
  holder: p.holder,
  legalStatus: p.legalStatus,
  species: p.species,
  dosageForm: p.dosageForm,
  prescription: requiresPrescription(p.legalStatus),
});

export type MedicineScanResult =
  | { status: "not_signed_in" | "invalid" }
  | { status: "ok"; scan: MedicinePackScan; product: MedicineProductChoice | null; linkUnavailable?: boolean };

/** Parses a scan and looks up the shared barcode -> HPRA product link. Read-only. */
export async function resolveMedicineScanAction(code: string): Promise<MedicineScanResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "not_signed_in" };
  const scan = typeof code === "string" ? parseMedicinePackScan(code) : null;
  if (!scan) return { status: "invalid" };
  try {
    const link = await findMedicineProductLink(scan.gtin);
    const product = link ? findHpraProduct(link.hpraLicenceNumber) : null;
    return { status: "ok", scan, product: product ? toChoice(product) : null };
  } catch (err) {
    console.error("[Medicines] product link lookup failed", err);
    return { status: "ok", scan, product: null, linkUnavailable: true };
  }
}

export async function searchMedicineProductsAction(query: string): Promise<MedicineProductChoice[]> {
  const farm = await getFarmForCurrentUser();
  if (!farm || typeof query !== "string" || query.length > 80) return [];
  return searchHpraProducts(query).map(toChoice);
}

export interface MedicineFormDefaults {
  suppliers: Array<{ name: string; address: string }>;
  vets: string[];
}

/** Previously used suppliers (with their last address) and vets, most recent first. */
export async function getMedicineFormDefaultsAction(): Promise<MedicineFormDefaults> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { suppliers: [], vets: [] };
  try {
    const rows = await listMedicinePurchases(farm.id, 200);
    const suppliers = new Map<string, { name: string; address: string }>();
    const vets = new Map<string, string>();
    for (const r of rows) {
      const key = r.supplierName.trim().toLowerCase();
      if (!suppliers.has(key)) suppliers.set(key, { name: r.supplierName, address: r.supplierAddress });
      if (r.vetName) {
        const vetKey = r.vetName.trim().toLowerCase();
        if (!vets.has(vetKey)) vets.set(vetKey, r.vetName);
      }
    }
    return { suppliers: [...suppliers.values()], vets: [...vets.values()] };
  } catch (err) {
    console.error("[Medicines] defaults unavailable", err);
    return { suppliers: [], vets: [] };
  }
}

export async function saveMedicinePurchaseAction(input: MedicinePurchaseInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to save medicine records." };
  // The product name and legal status always come from the HPRA list, never the browser.
  const product = input && typeof input.hpraLicenceNumber === "string" ? findHpraProduct(input.hpraLicenceNumber) : null;
  if (!product) return { ok: false, error: "Choose the medicine from the HPRA list." };
  // Allow one day of slack so a farmer's local "today" is never rejected by the server's UTC clock.
  const latestDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const error = validateMedicinePurchase(input, latestDate, requiresPrescription(product.legalStatus));
  if (error) return { ok: false, error };
  try {
    if (input.gtin) {
      await ensureMedicineProductLink({ gtin: input.gtin, hpraLicenceNumber: product.licenceNumber, productName: product.name });
    }
    const id = await createMedicinePurchase(farm.id, input, { name: product.name, legalStatus: product.legalStatus });
    return { ok: true, id };
  } catch (err) {
    console.error("[Medicines] save failed", err);
    return { ok: false, error: "Couldn't save the record just now. Nothing was saved. Please try again." };
  }
}

export async function listMedicinePurchasesAction(): Promise<{ ok: true; purchases: MedicinePurchase[] } | { ok: false; error: string }> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { ok: false, error: "Sign in to see medicine records." };
  try {
    return { ok: true, purchases: await listMedicinePurchases(farm.id) };
  } catch (err) {
    console.error("[Medicines] list failed", err);
    return { ok: false, error: "Medicine records couldn't be loaded just now." };
  }
}
