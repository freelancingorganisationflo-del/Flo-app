import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Copy .env.example to .env and fill in " +
      "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from your Supabase project settings."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Storage bucket names — create these in Supabase Storage (see README).
export const SUBMISSIONS_BUCKET = "assignment-submissions";
export const NOTES_BUCKET = "module-notes";
