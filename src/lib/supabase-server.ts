import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseServerClient = ReturnType<typeof createClient<any>>;

let clientInstance: SupabaseServerClient | null = null;

/**
 * PRD MVP behavior (fail-fast):
 * - If required Supabase env vars are missing, throw a clear error.
 * - No demo/preview mode fallback.
 * - Do not throw at import; throw only when createServerClient() is called.
 */
export function createServerClient(): SupabaseServerClient {
  if (clientInstance) return clientInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase not configured: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  clientInstance = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return clientInstance;
}

export function isMockMode(): boolean {
  return false;
}
