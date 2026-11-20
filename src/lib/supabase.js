import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://tgqdatnrjnveqzbvfcrq.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncWRhdG5yam52ZXF6YnZmY3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxODE2NzUsImV4cCI6MjExMDc1NzY3NX0.6oOgv4DPXDEectS7SI2UzObnBxHARG4VgPMrsCmyIfs";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
