import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  StoredSchemeDefinition,
  StoredSchemeRule,
  StoredSchemeRuleInput,
  StoredSchemeSource,
  StoredSchemeVersion,
} from "@/domain/schemes/repository";
import { assertStoredSchemeDefinition } from "@/domain/schemes/validation";

type CatalogueJoin = {
  display_name: string;
  category: string;
  authority: string;
};

type VersionRow = {
  id: string;
  scheme_key: string;
  scheme_year: number;
  programme_generation: string | null;
  rules_version: string;
  effective_from: string | null;
  effective_to: string | null;
  application_open: string | null;
  application_close: string | null;
  late_application_close: string | null;
  publication_state: StoredSchemeVersion["publicationState"];
  v1_enabled: boolean;
  enterprise_relevance: string[] | null;
  support_type: string | null;
  recurrence_type: string | null;
  requires_adviser: boolean;
  verified_at: string | null;
  scheme_catalogue: CatalogueJoin | CatalogueJoin[];
};

type SourceRow = {
  id: string;
  scheme_version_id: string;
  source_key: string;
  authority_tier: string;
  publisher: string;
  title: string;
  url: string;
  publication_date: string | null;
  retrieved_at: string | null;
  last_verified_at: string | null;
  content_fingerprint_sha256: string | null;
  archived_storage_path: string | null;
};

type RuleRow = {
  id: string;
  scheme_version_id: string;
  source_id: string;
  rule_key: string;
  rule_type: StoredSchemeRule["ruleType"];
  description: string;
  operator: string;
  parameters: Record<string, unknown> | null;
  consequence: Record<string, unknown> | null;
  hard_gate: boolean;
  effective_from: string | null;
  effective_to: string | null;
};

type InputRow = {
  rule_id: string;
  scheme_version_id: string;
  data_key: string;
  label: string;
  owner: StoredSchemeRuleInput["owner"];
  subject_scope: StoredSchemeRuleInput["subjectScope"];
  required: boolean;
  resolution_owner: StoredSchemeRuleInput["resolutionOwner"];
  priority: number;
  route_key: string | null;
};

function oneCatalogue(value: VersionRow["scheme_catalogue"]): CatalogueJoin {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) throw new Error("SCHEME_CATALOGUE_JOIN_MISSING");
  return row;
}

function mapVersion(row: VersionRow): StoredSchemeVersion {
  const catalogue = oneCatalogue(row.scheme_catalogue);
  return {
    id: row.id,
    schemeKey: row.scheme_key,
    displayName: catalogue.display_name,
    category: catalogue.category,
    authority: catalogue.authority,
    schemeYear: row.scheme_year,
    programmeGeneration: row.programme_generation,
    rulesVersion: row.rules_version,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    applicationOpen: row.application_open,
    applicationClose: row.application_close,
    lateApplicationClose: row.late_application_close,
    publicationState: row.publication_state,
    v1Enabled: row.v1_enabled,
    enterpriseRelevance: row.enterprise_relevance ?? [],
    supportType: row.support_type,
    recurrenceType: row.recurrence_type,
    requiresAdviser: row.requires_adviser,
    verifiedAt: row.verified_at,
  };
}

function mapSource(row: SourceRow): StoredSchemeSource {
  return {
    id: row.id,
    schemeVersionId: row.scheme_version_id,
    sourceKey: row.source_key,
    authorityTier: row.authority_tier,
    publisher: row.publisher,
    title: row.title,
    url: row.url,
    publicationDate: row.publication_date,
    retrievedAt: row.retrieved_at,
    lastVerifiedAt: row.last_verified_at,
    contentFingerprintSha256: row.content_fingerprint_sha256,
    archivedStoragePath: row.archived_storage_path,
  };
}

function mapInput(row: InputRow): StoredSchemeRuleInput {
  return {
    ruleId: row.rule_id,
    schemeVersionId: row.scheme_version_id,
    dataKey: row.data_key,
    label: row.label,
    owner: row.owner,
    subjectScope: row.subject_scope,
    required: row.required,
    resolutionOwner: row.resolution_owner,
    priority: row.priority,
    routeKey: row.route_key,
  };
}

function mapRule(row: RuleRow, inputs: StoredSchemeRuleInput[]): StoredSchemeRule {
  return {
    id: row.id,
    schemeVersionId: row.scheme_version_id,
    sourceId: row.source_id,
    ruleKey: row.rule_key,
    ruleType: row.rule_type,
    description: row.description,
    operator: row.operator,
    parameters: row.parameters ?? {},
    consequence: row.consequence ?? {},
    hardGate: row.hard_gate,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    inputs,
  };
}

/**
 * Reads the local, versioned Schemes repository. There is deliberately no
 * network fallback: a missing/unavailable repository is an unavailable
 * Schemes capability, not permission to fetch or guess current rules.
 */
export async function listStoredSchemeDefinitions(options: {
  v1Only?: boolean;
  /**
   * Administrative/research callers may opt into draft/superseded versions.
   * Farmer-facing reads default to VERIFIED only.
   */
  includeNonVerified?: boolean;
} = {}): Promise<StoredSchemeDefinition[]> {
  const supabase = await createClient();

  let versionsQuery = supabase
    .from("scheme_versions")
    .select(
      "id,scheme_key,scheme_year,programme_generation,rules_version,effective_from,effective_to,application_open,application_close,late_application_close,publication_state,v1_enabled,enterprise_relevance,support_type,recurrence_type,requires_adviser,verified_at,scheme_catalogue!inner(display_name,category,authority)",
    )
    .order("scheme_year", { ascending: false })
    .order("scheme_key", { ascending: true });

  if (options.v1Only ?? true) versionsQuery = versionsQuery.eq("v1_enabled", true);
  if (!(options.includeNonVerified ?? false)) {
    versionsQuery = versionsQuery.eq("publication_state", "verified");
  }

  const { data: versionData, error: versionError } = await versionsQuery;
  if (versionError) throw versionError;

  const versions = (versionData as unknown as VersionRow[]).map(mapVersion);
  if (versions.length === 0) return [];

  const versionIds = versions.map((version) => version.id);

  const [{ data: sourceData, error: sourceError }, { data: ruleData, error: ruleError }] =
    await Promise.all([
      supabase
        .from("scheme_sources")
        .select(
          "id,scheme_version_id,source_key,authority_tier,publisher,title,url,publication_date,retrieved_at,last_verified_at,content_fingerprint_sha256,archived_storage_path",
        )
        .in("scheme_version_id", versionIds),
      supabase
        .from("scheme_rules")
        .select(
          "id,scheme_version_id,source_id,rule_key,rule_type,description,operator,parameters,consequence,hard_gate,effective_from,effective_to",
        )
        .in("scheme_version_id", versionIds),
    ]);

  if (sourceError) throw sourceError;
  if (ruleError) throw ruleError;

  const sourceRows = (sourceData as unknown as SourceRow[]).map(mapSource);
  const ruleRows = ruleData as unknown as RuleRow[];
  const ruleIds = ruleRows.map((rule) => rule.id);

  let inputs: StoredSchemeRuleInput[] = [];
  if (ruleIds.length > 0) {
    const { data: inputData, error: inputError } = await supabase
      .from("scheme_rule_inputs")
      .select(
        "rule_id,scheme_version_id,data_key,label,owner,subject_scope,required,resolution_owner,priority,route_key",
      )
      .in("rule_id", ruleIds);
    if (inputError) throw inputError;
    inputs = (inputData as unknown as InputRow[]).map(mapInput);
  }

  const inputsByRule = new Map<string, StoredSchemeRuleInput[]>();
  for (const input of inputs) {
    inputsByRule.set(input.ruleId, [...(inputsByRule.get(input.ruleId) ?? []), input]);
  }

  const rules = ruleRows.map((rule) =>
    mapRule(
      rule,
      (inputsByRule.get(rule.id) ?? []).sort(
        (a, b) => a.priority - b.priority || a.dataKey.localeCompare(b.dataKey),
      ),
    ),
  );

  const definitions = versions.map((version) => ({
    version,
    sources: sourceRows
      .filter((source) => source.schemeVersionId === version.id)
      .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    rules: rules
      .filter((rule) => rule.schemeVersionId === version.id)
      .sort((a, b) => a.ruleKey.localeCompare(b.ruleKey)),
  }));

  // Never let a malformed source/rule/input record become a farmer-facing
  // assessment merely because it was present in the database.
  for (const definition of definitions) assertStoredSchemeDefinition(definition);

  return definitions;
}
