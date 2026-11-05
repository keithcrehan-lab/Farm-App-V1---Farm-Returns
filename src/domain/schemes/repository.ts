import type {
  SchemeDataOwner,
  SchemeRequirementPurpose,
  SchemeResolutionOwner,
} from "./contracts";

export type SchemePublicationState = "draft" | "verified" | "superseded";

export interface StoredSchemeVersion {
  id: string;
  schemeKey: string;
  displayName: string;
  category: string;
  authority: string;
  schemeYear: number;
  programmeGeneration: string | null;
  rulesVersion: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  applicationOpen: string | null;
  applicationClose: string | null;
  lateApplicationClose: string | null;
  publicationState: SchemePublicationState;
  v1Enabled: boolean;
  enterpriseRelevance: string[];
  supportType: string | null;
  recurrenceType: string | null;
  requiresAdviser: boolean;
  verifiedAt: string | null;
}

export interface StoredSchemeSource {
  id: string;
  schemeVersionId: string;
  sourceKey: string;
  authorityTier: string;
  publisher: string;
  title: string;
  url: string;
  publicationDate: string | null;
  retrievedAt: string | null;
  lastVerifiedAt: string | null;
  contentFingerprintSha256: string | null;
  archivedStoragePath: string | null;
}

export interface StoredSchemeRuleInput {
  ruleId: string;
  schemeVersionId: string;
  dataKey: string;
  label: string;
  owner: SchemeDataOwner;
  subjectScope: "farm" | "field" | "animal" | "group";
  required: boolean;
  resolutionOwner: SchemeResolutionOwner;
  priority: number;
  routeKey: string | null;
}

export interface StoredSchemeRule {
  id: string;
  schemeVersionId: string;
  sourceId: string;
  ruleKey: string;
  ruleType:
    | "relevance"
    | "eligibility"
    | "payment"
    | "cap"
    | "exclusion"
    | "action_obligation"
    | "evidence_obligation"
    | "compatibility"
    | "deadline";
  description: string;
  operator: string;
  parameters: Record<string, unknown>;
  consequence: Record<string, unknown>;
  hardGate: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  inputs: StoredSchemeRuleInput[];
}

export interface StoredSchemeDefinition {
  version: StoredSchemeVersion;
  sources: StoredSchemeSource[];
  rules: StoredSchemeRule[];
}

export function purposeForStoredRule(
  ruleType: StoredSchemeRule["ruleType"],
): SchemeRequirementPurpose {
  switch (ruleType) {
    case "relevance":
      return "relevance";
    case "eligibility":
    case "cap":
    case "exclusion":
    case "compatibility":
      return "eligibility";
    case "payment":
      return "payment";
    case "action_obligation":
      return "action";
    case "evidence_obligation":
      return "evidence";
    case "deadline":
      return "deadline";
  }
}
