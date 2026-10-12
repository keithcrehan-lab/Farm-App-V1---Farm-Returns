/**
 * Cattle C3 — readers for canonical plain data shared by the health modules
 * (module-internal; not part of the barrel). They validate shape only and
 * never repair or coerce a value.
 */

import {
  ASSESSMENT_FINGERPRINT_ALGORITHM,
  ASSESSMENT_INTEGRITY_SCHEMA_VERSION,
  type AssessmentFingerprint,
} from "../../assessment-integrity";
import { isOpaqueRef } from "../animal-ledger";
import { compareStrings } from "../integrity";
import type { SourceVersionRef } from "../source";
import type { SuppliedQuantity } from "./health-records";

export type Raw = Record<string, unknown>;

export function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** `undefined`/`null` → `null`; an opaque ref → itself; anything else → invalid. */
export function nullableRef(value: unknown): { ok: boolean; value: string | null } {
  if (value === undefined || value === null) return { ok: true, value: null };
  return isOpaqueRef(value) ? { ok: true, value } : { ok: false, value: null };
}

const SHA256_HEX_DIGEST = /^[0-9a-f]{64}$/;

/** A fingerprint exactly as `assessment-integrity.ts` produces it (CAT-INV-024). */
export function fingerprintOf(raw: unknown): AssessmentFingerprint | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== ASSESSMENT_INTEGRITY_SCHEMA_VERSION || raw.algorithm !== ASSESSMENT_FINGERPRINT_ALGORITHM) return null;
  if (typeof raw.digest !== "string" || !SHA256_HEX_DIGEST.test(raw.digest)) return null;
  return { schemaVersion: ASSESSMENT_INTEGRITY_SCHEMA_VERSION, algorithm: ASSESSMENT_FINGERPRINT_ALGORITHM, digest: raw.digest };
}

export function sourceVersionRefOf(raw: unknown): SourceVersionRef | null {
  if (!isRecord(raw) || !isOpaqueRef(raw.sourceId) || !isOpaqueRef(raw.version)) return null;
  const contentFingerprint = fingerprintOf(raw.contentFingerprint);
  return contentFingerprint ? { sourceId: raw.sourceId, version: raw.version, contentFingerprint } : null;
}

/** A finite, non-negative amount with an opaque unit, kept exactly as supplied. */
export function suppliedQuantityOf(raw: unknown): SuppliedQuantity | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount < 0 || !isOpaqueRef(raw.unit)) return null;
  return { amount: raw.amount, unit: raw.unit };
}

/** Deterministic rendering of canonical data for identity comparison of (possibly invalid) raw copies. */
export function rawIdentityKey(value: unknown): string {
  if (value === undefined) return "<undefined>";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(rawIdentityKey).join(",")}]`;
  const record = value as Raw;
  return `{${Object.keys(record)
    .sort(compareStrings)
    .map((k) => `${JSON.stringify(k)}:${rawIdentityKey(record[k])}`)
    .join(",")}}`;
}
