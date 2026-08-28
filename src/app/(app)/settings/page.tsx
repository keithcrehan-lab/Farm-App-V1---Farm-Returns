import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { SettingsPageClient } from "./SettingsPageClient";

export default async function SettingsPage() {
  const supabaseConfigured = isSupabaseConfigured();
  let userEmail: string | null = null;

  if (supabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return <SettingsPageClient userEmail={userEmail} supabaseConfigured={supabaseConfigured} />;
}
