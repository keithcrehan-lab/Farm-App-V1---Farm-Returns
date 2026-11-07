/** Build a link which can be opened by a regular phone camera or Farm Return scanner. */
export function buildFieldQrLink(origin: string, fieldId: string): string {
  if (!fieldId.trim()) throw new Error('Field ID is required');
  const url = new URL('/fields', origin);
  url.searchParams.set('field', fieldId);
  return url.toString();
}
