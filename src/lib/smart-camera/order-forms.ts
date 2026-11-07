import { normaliseGtin } from './fertiliser-products';

export interface OrderFormInput {
  productGtin: string;
  supplierName: string;
  supplierReference: string;
  orderedKg: number;
  confirmedDate: string;
  confirmationSource: string;
}
export interface DeliveryFormInput {
  orderId: string;
  productGtin: string;
  receivedKg: number;
  deliveryReference: string;
  receivedDate: string;
}

export function validDate(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const [y,m,d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth()+1 === m && date.getUTCDate() === d;
}
export function validateOrderInput(input: OrderFormInput, today: string): string | null {
  if (!normaliseGtin(input.productGtin)) return 'Invalid product code';
  if (!input.supplierName.trim() || input.supplierName.trim().length > 200) return 'Enter a supplier';
  if (!input.supplierReference.trim() || input.supplierReference.trim().length > 120) return 'Enter a real order reference';
  if (!Number.isFinite(input.orderedKg) || input.orderedKg <= 0 || input.orderedKg >= 100000000) return 'Enter the confirmed order quantity in kg';
  if (!validDate(input.confirmedDate, today)) return 'Enter a real confirmation date';
  if (!input.confirmationSource.trim() || input.confirmationSource.trim().length > 240) return 'Enter the source of the order confirmation';
  return null;
}
export function validateDeliveryInput(input: DeliveryFormInput, today: string): string | null {
  if (!input.orderId || !normaliseGtin(input.productGtin)) return 'Select a valid order and product';
  if (!Number.isFinite(input.receivedKg) || input.receivedKg <= 0 || input.receivedKg >= 100000000) return 'Enter received kg';
  if (!input.deliveryReference.trim() || input.deliveryReference.trim().length > 120) return 'Enter the delivery docket reference';
  if (!validDate(input.receivedDate, today)) return 'Enter a real delivery date';
  return null;
}
