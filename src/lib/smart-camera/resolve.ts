/** Deterministic Smart Camera routing. No AI guesses or unverified writes. */
export type ScanResolution =
  | { kind: 'field'; fieldId: string }
  | { kind: 'unknown'; reason: 'invalid' | 'unrecognised' };

/** Only signed-in farm's known identifiers are trusted, never arbitrary QR URLs. */
export function resolveFieldScan(raw: string, knownFieldIds: readonly string[]): ScanResolution {
  const value = raw.trim();
  if (!value || value.length > 2048) return { kind: 'unknown', reason: 'invalid' };
  let id: string | null = null;
  if (value.startsWith('farmreturn:field:')) {
    id = value.slice('farmreturn:field:'.length);
  } else {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'unknown', reason: 'invalid' };
      if (url.pathname === '/fields' && url.searchParams.has('field') && !url.username && !url.password) {
        id = url.searchParams.get('field');
      }
    } catch {
      return { kind: 'unknown', reason: 'unrecognised' };
    }
  }
  if (!id || !knownFieldIds.includes(id)) return { kind: 'unknown', reason: 'unrecognised' };
  return { kind: 'field', fieldId: id };
}
