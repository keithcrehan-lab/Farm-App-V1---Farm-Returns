import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SchemeFactAssertion } from "@/domain/schemes/facts";
import { validateScep2026SchemeFact } from "@/domain/schemes/facts";

export const SCEP_2026_STORED_VERSION = {
  schemeKey: "scep",
  schemeYear: 2026,
  rulesVersion: "scep-2026-v1",
} as const;

interface SchemeFactAssertionRow {
  id: string;
  farm_id: string;
  scheme_version_id: string;
  data_key: string;
  value: unknown;
  assertion_status: SchemeFactAssertion["assertionStatus"];
  source_kind: SchemeFactAssertion["sourceKind"];
  source_ref: string | null;
  asserted_by: string | null;
  observed_at: string | null;
  received_at: string;
  supersedes_id: string | null;
}

function mapAssertion(row: SchemeFactAssertionRow): SchemeFactAssertion {
  return {
    id: row.id,
    farmId: row.farm_id,
    schemeVersionId: row.scheme_version_id,
    dataKey: row.data_key,
    value: row.value,
    assertionStatus: row.assertion_status,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    assertedBy: row.asserted_by,
    observedAt: row.observed_at,
    receivedAt: row.received_at,
    supersedesId: row.supersedes_id,
  };
}

export async function resolveStoredSchemeVersionId(input: {
  schemeKey: string;
  schemeYear: number;
  rulesVersion: string;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheme_versions")
    .select("id")
    .eq("scheme_key", input.schemeKey)
    .eq("scheme_year", input.schemeYear)
    .eq("rules_version", input.rulesVersion)
    .eq("publication_state", "verified")
    .eq("v1_enabled", true)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export async function listSchemeFactAssertionsForFarm(
  farmId: string,
  schemeVersionId: string,
): Promise<SchemeFactAssertion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("farm_scheme_fact_assertions")
    .select(
      "id,farm_id,scheme_version_id,data_key,value,assertion_status,source_kind,source_ref,asserted_by,observed_at,received_at,supersedes_id",
    )
    .eq("farm_id", farmId)
    .eq("scheme_version_id", schemeVersionId)
    .order("received_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw error;
  return (data as SchemeFactAssertionRow[]).map(mapAssertion);
}

/** Latest append-only assertion for every data key. */
export function latestSchemeFactAssertions(
  assertions: SchemeFactAssertion[],
): ReadonlyMap<string, SchemeFactAssertion> {
  const latest = new Map<string, SchemeFactAssertion>();
  for (const assertion of assertions) {
    const current = latest.get(assertion.dataKey);
    if (
      !current ||
      assertion.receivedAt > current.receivedAt ||
      (assertion.receivedAt === current.receivedAt &&
        assertion.id > current.id)
    ) {
      latest.set(assertion.dataKey, assertion);
    }
  }
  return latest;
}

/**
 * Append one farmer-confirmed SCEP fact. The farm id is supplied only by a
 * server action that resolves the signed-in user's own farm; RLS is the
 * backstop. Corrections supersede the previous assertion, never mutate it.
 */
export async function appendScep2026FactAssertion(
  farmId: string,
  dataKey: string,
  value: unknown,
): Promise<SchemeFactAssertion> {
  const validation = validateScep2026SchemeFact(dataKey, value);
  if (!validation.valid) {
    throw new Error("Invalid SCEP fact: " + validation.reason);
  }

  const schemeVersionId = await resolveStoredSchemeVersionId(
    SCEP_2026_STORED_VERSION,
  );
  if (!schemeVersionId) {
    throw new Error("SCEP 2026 scheme version is not available.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to save scheme facts.");

  const { data: previousData, error: previousError } = await supabase
    .from("farm_scheme_fact_assertions")
    .select(
      "id,farm_id,scheme_version_id,data_key,value,assertion_status,source_kind,source_ref,asserted_by,observed_at,received_at,supersedes_id",
    )
    .eq("farm_id", farmId)
    .eq("scheme_version_id", schemeVersionId)
    .eq("data_key", dataKey)
    .order("received_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousError) throw previousError;
  const previous = previousData
    ? mapAssertion(previousData as SchemeFactAssertionRow)
    : null;

  if (
    previous &&
    previous.assertionStatus === "farmer_confirmed" &&
    Object.is(previous.value, validation.value)
  ) {
    return previous;
  }

  const { data, error } = await supabase
    .from("farm_scheme_fact_assertions")
    .insert({
      farm_id: farmId,
      scheme_version_id: schemeVersionId,
      data_key: dataKey,
      value: validation.value,
      assertion_status: "farmer_confirmed",
      source_kind: "farmer_entered",
      source_ref: "Farm Return Schemes — SCEP 2026",
      asserted_by: user.id,
      observed_at: null,
      supersedes_id: previous?.id ?? null,
    })
    .select(
      "id,farm_id,scheme_version_id,data_key,value,assertion_status,source_kind,source_ref,asserted_by,observed_at,received_at,supersedes_id",
    )
    .single();

  if (error) throw error;
  return mapAssertion(data as SchemeFactAssertionRow);
}
