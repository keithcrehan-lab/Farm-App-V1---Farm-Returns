import type { EligibilityAssessment } from "@/domain/scheme-eligibility";

/**
 * Pilot acceptance repair — Supports' farmer-facing wording. Some stored scheme evidence (the registry's own
 * provenance notes, kept intact for audit) describes how a fact was obtained in internal tooling terms ("this
 * session's own fetch tool returned HTTP 403", "WebSearch result summary"). That provenance stays in the registry and
 * the engine unchanged; it is just never shown to a farmer. In its place the farmer sees what it means: the point
 * couldn't be checked against the official source yet, so Farm Return doesn't rely on it. Eligibility states,
 * rules and sources are untouched.
 */
const INTERNAL_PROVENANCE = /\bthis session\b|\bsession's own\b|\bweb ?search\b|\bweb ?fetch\b|\bfetch tool\b|\bHTTP \d{3}\b|\bsearch result summary\b/i;

export const UNCHECKED_SOURCE_NOTE = "Part of this scheme's information couldn't be checked against the official source yet, so Farm Return doesn't rely on it.";

export const RULES_UNVERIFIED_EXPLANATION =
  "Farm Return hasn't been able to confirm this scheme's rules and figures from the official source yet, so it won't say whether you're eligible. Nothing is guessed in their place.";

export function isInternalProvenanceText(text: string): boolean {
  return INTERNAL_PROVENANCE.test(text);
}

/** The farmer-facing "why" line for an assessment. */
export function farmerWhyThisState(a: Pick<EligibilityAssessment, "state" | "whyThisState">): string {
  if (a.state === "RULES_UNVERIFIED") return RULES_UNVERIFIED_EXPLANATION;
  return isInternalProvenanceText(a.whyThisState) ? UNCHECKED_SOURCE_NOTE : a.whyThisState;
}

/** A farmer-facing list: internal provenance notes become one plain note (never repeated); others pass unchanged. */
export function farmerTextList(items: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of items) {
    const shown = isInternalProvenanceText(t) ? UNCHECKED_SOURCE_NOTE : t;
    if (!out.includes(shown)) out.push(shown);
  }
  return out;
}
