/**
 * Cattle C2 — single-pass, detached materialisation of caller input.
 *
 * The ONE boundary between caller-controlled objects and the engine:
 *
 *   caller object → `snapshotInput` (each semantic property read at most
 *   once) → detached internal snapshot → knowledge-cutoff admission →
 *   validation → supersession → evaluation.
 *
 * After this step nothing in C2 reads the caller's object again, so
 * accessors, proxies or later mutation of the caller's object (or of any
 * nested object such as `provenance`) cannot expose one value to admission
 * and another to validation, and cannot change a result once materialised.
 *
 * Reading rules (deterministic, no coercion):
 * - strings, finite or non-finite numbers, booleans, `null` and `undefined`
 *   are copied as-is (validation decides whether they are acceptable);
 * - an array has its `length` read once and each index read once;
 * - a plain object (prototype `Object.prototype` or `null`) has its own keys
 *   listed once; each enumerable string key is read once — a data property
 *   through its descriptor, an accessor by invoking its getter exactly once.
 *   Symbol keys and non-enumerable keys are not data and are not read;
 * - anything else — a function, symbol, bigint, class instance, Date, Map,
 *   a cyclic reference, nesting deeper than `SNAPSHOT_MAX_DEPTH`, or a read
 *   that throws — is NOT DATA: it is never executed or coerced; the snapshot
 *   records a `NON_DATA` marker in its place and sets `nonData`.
 *
 * A snapshot with `nonData` still carries every readable value, so its
 * knowledge time can be established from the same single read: a record
 * provably known only after the cutoff is invisible; otherwise a NON_DATA
 * record fails closed. The snapshot is plain, cloneable and deep-frozen.
 */

import { deepFreezeAnimalValue } from "../animal-ledger";

export const SNAPSHOT_MAX_DEPTH = 64;

/** Placeholder recorded where a caller value was not data. */
export const NON_DATA_MARKER = "CATTLE_INPUT_NON_DATA";

export interface InputSnapshot {
  /** Detached, deep-frozen plain data (NON_DATA positions hold `NON_DATA_MARKER`). */
  readonly value: unknown;
  /** True when any position of the input was not data (the record must fail closed if admitted). */
  readonly nonData: boolean;
}

export function snapshotInput(input: unknown): InputSnapshot {
  let nonData = false;
  const active = new Set<object>();
  const marker = () => {
    nonData = true;
    return NON_DATA_MARKER;
  };

  const read = (value: unknown, depth: number): unknown => {
    switch (typeof value) {
      case "string":
      case "number":
      case "boolean":
      case "undefined":
        return value;
      case "object":
        break;
      default:
        return marker(); // function, symbol, bigint: never executed or coerced
    }
    if (value === null) return null;
    const obj = value as object;
    if (depth > SNAPSHOT_MAX_DEPTH || active.has(obj)) return marker();
    active.add(obj);
    try {
      if (Array.isArray(obj)) {
        const length: unknown = (obj as unknown[]).length;
        if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return marker();
        const out: unknown[] = [];
        for (let i = 0; i < length; i++) out.push(read((obj as unknown[])[i], depth + 1));
        return out;
      }
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) return marker();
      const out: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(obj)) {
        if (typeof key !== "string") continue;
        const descriptor = Reflect.getOwnPropertyDescriptor(obj, key);
        if (!descriptor || !descriptor.enumerable) continue;
        const raw = "value" in descriptor ? descriptor.value : descriptor.get ? descriptor.get.call(obj) : undefined;
        // defineProperty: a key such as "__proto__" stays an ordinary own data property.
        Object.defineProperty(out, key, { value: read(raw, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return out;
    } catch {
      return marker(); // a throwing trap or getter
    } finally {
      active.delete(obj);
    }
  };

  const value = read(input, 0);
  return { value: deepFreezeAnimalValue(value), nonData };
}

/**
 * Reads a caller list exactly once — `length` once, each index once — into
 * snapshots (never via iteration, which re-reads `length` per step). `null`
 * when the value is not an array or its length is unreadable.
 */
export function snapshotListOnce(list: unknown): InputSnapshot[] | null {
  if (!Array.isArray(list)) return null;
  try {
    const length: unknown = list.length;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return null;
    const out: InputSnapshot[] = [];
    for (let i = 0; i < length; i++) {
      let item: unknown;
      try {
        item = list[i];
      } catch {
        item = () => undefined; // an unreadable element is not data
      }
      out.push(snapshotInput(item));
    }
    return out;
  } catch {
    return null;
  }
}

/** Reads a caller list of executable entries exactly once (`length` once, each index once). */
export function readListOnce(list: unknown): unknown[] | null {
  if (!Array.isArray(list)) return null;
  try {
    const length: unknown = list.length;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return null;
    const out: unknown[] = [];
    for (let i = 0; i < length; i++) {
      try {
        out.push(list[i]);
      } catch {
        out.push(null);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** One property of a snapshot (plain data); `undefined` when absent or not an object. */
export function snapshotField(value: unknown, ...path: string[]): unknown {
  let at: unknown = value;
  for (const key of path) {
    if (at === null || typeof at !== "object" || Array.isArray(at) || !Object.prototype.hasOwnProperty.call(at, key)) return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}
