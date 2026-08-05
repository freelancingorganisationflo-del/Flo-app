import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// When env vars are missing the app still renders (auth pages, UI) instead of
// crashing on a blank page. Real calls are guarded by isSupabaseConfigured.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Storage bucket names — create these in Supabase Storage (see README).
export const SUBMISSIONS_BUCKET = "assignment-submissions";
export const NOTES_BUCKET = "module-notes";
// Requires supabase/profile_extras.sql to be applied first.
export const AVATARS_BUCKET = "avatars";
