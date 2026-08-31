import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";

export const supabaseConfigured = Boolean(url && key);

export const supabaseUrl = url;

export const supabaseProjectRef = (() => {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] ?? "" : "";
  } catch {
    return "";
  }
})();

export const supabaseSqlEditorUrl = supabaseProjectRef
  ? `https://supabase.com/dashboard/project/${supabaseProjectRef}/sql/new`
  : "https://supabase.com/dashboard";

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
