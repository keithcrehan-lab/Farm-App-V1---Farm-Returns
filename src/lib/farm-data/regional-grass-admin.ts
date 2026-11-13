import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * One verified identity may publish shared regional grass-growth reference
 * data. The app_admins row provides a second, database-enforced permission
 * check; a client-side hidden menu is never an authorisation boundary.
 */
const REGIONAL_GROWTH_ADMIN_EMAIL = "keith.crehan@gmail.com";

export async function getRegionalGrassAdminClient() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth.user;
  if (
    authError ||
    !user ||
    user.email?.trim().toLowerCase() !== REGIONAL_GROWTH_ADMIN_EMAIL ||
    !user.email_confirmed_at
  ) return null;

  const { data, error } = await supabase.from("app_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;

  return { supabase, userId: user.id };
}

export async function canCurrentUserManageRegionalGrassGrowth(): Promise<boolean> {
  return Boolean(await getRegionalGrassAdminClient());
}
