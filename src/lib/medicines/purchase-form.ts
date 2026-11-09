export interface MedicinePurchaseInput {
  gtin: string | null;
  hpraLicenceNumber: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  dateReceived: string;
  supplierName: string;
  supplierAddress: string;
  vetName: string;
  prescriptionId: string;
  captureSource: "datamatrix" | "barcode" | "manual";
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (v: string) => ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** Returns a farmer-readable error, or `null` when the input is acceptable. */
export function validateMedicinePurchase(input: MedicinePurchaseInput, today: string, requiresPrescription: boolean): string | null {
  if (!input || typeof input !== "object") return "Nothing to save.";
  if (input.gtin !== null && !/^\d{14}$/.test(input.gtin)) return "The scanned barcode isn't valid. Scan the pack again.";
  if (!input.hpraLicenceNumber?.trim()) return "Choose the medicine from the HPRA list.";
  if (input.batchNumber && input.batchNumber.trim().length > 40) return "Batch number is too long.";
  if (input.expiryDate && !validIso(input.expiryDate)) return "Expiry date isn't a valid date.";
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10000) return "Quantity must be between 1 and 10,000 packs.";
  if (!validIso(input.dateReceived)) return "Date received isn't a valid date.";
  if (input.dateReceived > today) return "Date received can't be in the future.";
  if (!input.supplierName?.trim()) return "Add the supplier's name.";
  if (input.supplierName.trim().length > 200) return "Supplier name is too long.";
  if (!input.supplierAddress?.trim()) return "Add the supplier's address. It's required on the animal remedies record.";
  if (input.supplierAddress.trim().length > 400) return "Supplier address is too long.";
  if (requiresPrescription && !input.vetName?.trim()) return "This is a prescription medicine. Add the prescribing vet.";
  if (input.vetName && input.vetName.trim().length > 200) return "Vet name is too long.";
  if (input.prescriptionId && input.prescriptionId.trim().length > 80) return "Prescription ID is too long.";
  if (!["datamatrix", "barcode", "manual"].includes(input.captureSource)) return "Unknown capture source.";
  return null;
}

export type ExpiryState = "expired" | "soon" | "ok" | "unknown";

/** `soon` = within 30 days. */
export function expiryState(expiry: string | null, today: string): ExpiryState {
  if (!expiry) return "unknown";
  if (expiry < today) return "expired";
  const days = (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 30 ? "soon" : "ok";
}
