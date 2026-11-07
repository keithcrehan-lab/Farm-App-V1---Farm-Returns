/** Public Verified by GS1 is an interactive website, not an unauthenticated API.
 * Its free terms limit lookups to 30 per rolling 24 hours and restrict the
 * results to internal use. This adapter deliberately makes NO HTTP request,
 * stores no GS1 results and does not infer that a checksum-valid GTIN exists
 * in GS1's registry. For licensed API use, implement a separate contract.
 */
import { normaliseGtin } from './fertiliser-products';

export const GS1_FREE_LOOKUP_URL = 'https://www.gs1.org/verified-by-gs1';

export type Gs1ManualLookup =
  | { status: 'ready_for_manual_lookup'; gtin: string; url: typeof GS1_FREE_LOOKUP_URL }
  | { status: 'invalid_gtin' };

export function prepareGs1FreeLookup(scannedCode: string): Gs1ManualLookup {
  if (!normaliseGtin(scannedCode)) return { status: 'invalid_gtin' };
  return { status: 'ready_for_manual_lookup', gtin: scannedCode.trim(), url: GS1_FREE_LOOKUP_URL };
}
