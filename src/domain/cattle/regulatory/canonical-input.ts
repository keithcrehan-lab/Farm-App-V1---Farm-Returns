/**
 * Cattle C2 — the canonical plain-data input contract (human architecture
 * decision, 2026-10-12).
 *
 * C2 authoritative evaluation consumes CANONICAL PLAIN DATA only. Runtime
 * materialisation of arbitrary caller objects (API payloads, database rows,
 * connector output) into canonical form is an ADAPTER responsibility,
 * performed before C2 is invoked. Historical reproducibility is guaranteed
 * over admitted canonical records. Executable rule implementations are
 * trusted code bindings (`obligation-implementations.ts`), never caller data.
 *
 * Canonical plain data is, recursively:
 * - a string, a finite number, a boolean, `null` or `undefined` (absent);
 * - an array whose prototype is `Array.prototype`, whose own keys are only
 *   its indices and `length`, and whose elements are plain data properties;
 * - an object whose prototype is `Object.prototype` or `null`, whose own
 *   keys are all strings and all enumerable DATA properties.
 * It contains no function, symbol, bigint, accessor (getter/setter),
 * non-enumerable or symbol-keyed property, class instance (Date, Map, ...),
 * cycle, or nesting deeper than `CANONICAL_MAX_DEPTH`.
 *
 * `toCanonicalPlainData` checks this from property DESCRIPTORS (a getter is
 * never invoked, a function never executed) and returns a detached,
 * deep-frozen copy; anything else is rejected as non-canonical, with the
 * path of the first offending position, before any authoritative
 * evaluation. Proxy-dependent behaviour is outside the contract.
 */

import { deepFreezeAnimalValue } from "../animal-ledger";

export const CANONICAL_MAX_DEPTH = 64;

export type CanonicalPlainDataResult = { ok: true; value: unknown } | { ok: false; path: string };

export function toCanonicalPlainData(input: unknown): CanonicalPlainDataResult {
  const active = new Set<object>();
  let failedAt: string | null = null;
  const fail = (path: string): undefined => {
    failedAt ??= path;
    return undefined;
  };

  const copy = (value: unknown, path: string, depth: number): unknown => {
    if (failedAt !== null) return undefined;
    switch (typeof value) {
      case "string":
      case "boolean":
      case "undefined":
        return value;
      case "number":
        return Number.isFinite(value) ? value : fail(path);
      case "object":
        break;
      default:
        return fail(path); // function, symbol, bigint
    }
    if (value === null) return null;
    const obj = value as object;
    if (depth > CANONICAL_MAX_DEPTH || active.has(obj)) return fail(path);
    active.add(obj);
    try {
      const isArray = Array.isArray(obj);
      const proto = Object.getPrototypeOf(obj);
      if (isArray ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return fail(path);
      const descriptors = Object.getOwnPropertyDescriptors(obj) as Record<string | symbol, PropertyDescriptor>;
      if (Object.getOwnPropertySymbols(descriptors).length > 0) return fail(path);
      if (isArray) {
        const lengthDescriptor = descriptors.length;
        const length: unknown = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
        if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return fail(path);
        if (Object.keys(descriptors).length !== length + 1) return fail(path); // holes or extra keys
        const out: unknown[] = [];
        for (let i = 0; i < length; i++) {
          const d = descriptors[String(i)];
          if (!d || !("value" in d) || !d.enumerable) return fail(`${path}[${i}]`);
          out.push(copy(d.value, `${path}[${i}]`, depth + 1));
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(descriptors)) {
        const d = descriptors[key];
        if (!("value" in d) || !d.enumerable) return fail(`${path}.${key}`); // accessor or hidden property
        // defineProperty: a key such as "__proto__" stays an ordinary own data property.
        Object.defineProperty(out, key, { value: copy(d.value, `${path}.${key}`, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return out;
    } catch {
      return fail(path); // outside the contract (e.g. a throwing proxy trap)
    } finally {
      active.delete(obj);
    }
  };

  const value = copy(input, "$", 0);
  return failedAt !== null ? { ok: false, path: failedAt } : { ok: true, value: deepFreezeAnimalValue(value) };
}

/** A field of canonical data (`undefined` when absent or not an object). */
export function canonicalField(value: unknown, ...path: string[]): unknown {
  let at: unknown = value;
  for (const key of path) {
    if (at === null || typeof at !== "object" || Array.isArray(at) || !Object.prototype.hasOwnProperty.call(at, key)) return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}
