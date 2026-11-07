import { describe, expect, it } from 'vitest';
import { resolveFieldScan } from './resolve';

describe('resolveFieldScan', () => {
  const fields = ['f-123', 'f-456'];
  it('routes only a known exact field ID', () => {
    expect(resolveFieldScan('farmreturn:field:f-123', fields)).toEqual({ kind: 'field', fieldId: 'f-123' });
  });
  it('supports field links', () => {
    expect(resolveFieldScan('https://app.example.com/fields?field=f-456', fields)).toEqual({ kind: 'field', fieldId: 'f-456' });
  });
  it('rejects unknown fields and other URLs', () => {
    expect(resolveFieldScan('farmreturn:field:foreign-farm', fields).kind).toBe('unknown');
    expect(resolveFieldScan('https://example.com/finance?field=f-123', fields).kind).toBe('unknown');
    expect(resolveFieldScan('javascript:alert(1)', fields).kind).toBe('unknown');
  });
  it('never treats a product barcode as a field', () => {
    expect(resolveFieldScan('5391234567890', fields)).toEqual({ kind: 'unknown', reason: 'unrecognised' });
  });
});
