import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Short-lived links to evidence photos, for the audit pack. Missing ones are skipped. */
export async function signedEvidenceUrls(paths: readonly string[], seconds = 3600): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("record-evidence").createSignedUrls(unique, seconds);
  if (error || !data) return new Map();
  return new Map(data.filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}
