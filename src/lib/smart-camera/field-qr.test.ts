import { describe, expect, it } from 'vitest';
import { buildFieldQrLink } from './field-qr';
import { resolveFieldScan } from './resolve';

describe('field QR code links', () => {
  it('generates links that round-trip into an exact farm field match', () => {
    const url = buildFieldQrLink('https://farm-return.example', 'real-field-123');
    expect(url).toBe('https://farm-return.example/fields?field=real-field-123');
    expect(resolveFieldScan(url, ['real-field-123'])).toEqual({ kind: 'field', fieldId: 'real-field-123' });
  });
  it('encodes special characters without changing the field identity', () => {
    const url = buildFieldQrLink('https://farm-return.example', 'a & b/4');
    expect(resolveFieldScan(url, ['a & b/4'])).toEqual({ kind: 'field', fieldId: 'a & b/4' });
    expect(resolveFieldScan(url, ['another-field']).kind).toBe('unknown');
  });
  it('refuses empty IDs', () => {
    expect(() => buildFieldQrLink('https://farm-return.example', '')).toThrow();
  });
});
