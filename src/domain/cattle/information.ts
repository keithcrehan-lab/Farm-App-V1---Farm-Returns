/**
 * Cattle C0 — information classes, provenance and rule inputs.
 *
 * Fact, observation, intent, rule, derived value, prediction,
 * obligation/constraint and recommendation stay distinct classes. A rule
 * input declares which classes may satisfy it, so a prediction or system
 * inference can never quietly stand in for a required fact.
 *
 * Input resolution never invents a value: no matching item is MISSING,
 * several differing values are CONFLICTING (no winner is chosen), and only
 * a single agreed value is KNOWN.
 */

import { canonicalizeValue } from "../assessment-integrity";
import { compareStrings } from "./integrity";

export type CattleInformationClass =
  | "FACT"
  | "OBSERVATION"
  | "INTENT"
  | "RULE"
  | "DERIVED_VALUE"
  | "PREDICTION"
  | "OBLIGATION_OR_CONSTRAINT"
  | "RECOMMENDATION";

export type CattleInputScalar = string | number | boolean;

export type ProvenanceKind = "CANONICAL_RECORD" | "OFFICIAL_SOURCE" | "FARMER_ENTRY" | "DEVICE" | "ENGINE_DERIVATION";

export interface ProvenanceRef {
  kind: ProvenanceKind;
  /** Record/source/device id the value came from. */
  ref: string;
  recordedAt: string | null;
}

/** One supplied fact/observation/intent/... for a named input key. */
export interface CattleInputItem {
  inputKey: string;
  value: CattleInputScalar;
  unit: string | null;
  informationClass: CattleInformationClass;
  provenance: ProvenanceRef;
}

export interface RequiredInputDescriptor {
  inputKey: string;
  description: string;
  unit: string | null;
  acceptedClasses: CattleInformationClass[];
}

export type ResolvedInput =
  | { inputKey: string; status: "KNOWN"; value: CattleInputScalar; unit: string | null; items: CattleInputItem[] }
  | { inputKey: string; status: "MISSING" }
  | { inputKey: string; status: "CONFLICTING"; items: CattleInputItem[] };

export interface RejectedInput {
  item: CattleInputItem;
  reasonCode: "CATTLE_INPUT_CLASS_NOT_ACCEPTED" | "CATTLE_INPUT_UNIT_MISMATCH";
}

export function compareInputItems(a: CattleInputItem, b: CattleInputItem): number {
  return (
    compareStrings(a.inputKey, b.inputKey) ||
    compareStrings(canonicalizeValue(a.value), canonicalizeValue(b.value)) ||
    compareStrings(a.unit ?? "", b.unit ?? "") ||
    compareStrings(a.informationClass, b.informationClass) ||
    compareStrings(a.provenance.kind, b.provenance.kind) ||
    compareStrings(a.provenance.ref, b.provenance.ref) ||
    compareStrings(a.provenance.recordedAt ?? "", b.provenance.recordedAt ?? "")
  );
}

/**
 * Resolves one declared input from supplied items. Items of an unaccepted
 * class or a unit other than the descriptor's are rejected (reported, never
 * used or converted). Value equality is canonical (type-sensitive: `0` and
 * `"0"` differ).
 */
export function resolveInput(
  descriptor: RequiredInputDescriptor,
  items: readonly CattleInputItem[],
): { resolved: ResolvedInput; rejected: RejectedInput[] } {
  const forKey = [...items].filter((i) => i.inputKey === descriptor.inputKey).sort(compareInputItems);
  const rejected: RejectedInput[] = [];
  const accepted: CattleInputItem[] = [];
  for (const item of forKey) {
    if (!descriptor.acceptedClasses.includes(item.informationClass)) rejected.push({ item, reasonCode: "CATTLE_INPUT_CLASS_NOT_ACCEPTED" });
    else if (item.unit !== descriptor.unit) rejected.push({ item, reasonCode: "CATTLE_INPUT_UNIT_MISMATCH" });
    else accepted.push(item);
  }
  if (accepted.length === 0) return { resolved: { inputKey: descriptor.inputKey, status: "MISSING" }, rejected };
  const distinct = new Set(accepted.map((i) => canonicalizeValue(i.value)));
  if (distinct.size > 1) return { resolved: { inputKey: descriptor.inputKey, status: "CONFLICTING", items: accepted }, rejected };
  return {
    resolved: { inputKey: descriptor.inputKey, status: "KNOWN", value: accepted[0].value, unit: accepted[0].unit, items: accepted },
    rejected,
  };
}
