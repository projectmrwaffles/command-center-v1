import { createClient } from "@supabase/supabase-js";

export type SupabaseServerClient = ReturnType<typeof createClient<any>>;

let clientInstance: SupabaseServerClient | null = null;

export type DbHealth =
  | { ok: true }
  | {
      ok: false;
      reason: "env_missing" | "db_not_initialized" | "unknown";
      message: string;
      details?: string;
    };

export function getDbHealth(): DbHealth {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // IMPORTANT:
  // This function is used by DbBanner (client component). Never require server-only
  // env vars here, otherwise the UI will always show "DB not initialized".
  if (!url || !anonKey) {
    return {
      ok: false,
      reason: "env_missing",
      message: "DB not initialized: missing Supabase environment variables.",
      details:
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (local: .env.local, prod: Vercel project env).",
    };
  }

  return { ok: true };
}

/**
 * V1 behavior: never throw during render.
 * - If env missing, return null (caller should render DB-not-initialized banner).
 * - If the server role key is missing, also return null so route handlers fail gracefully.
 */
export function createServerClient(): SupabaseServerClient | null {
  if (clientInstance) return clientInstance;

  const health = getDbHealth();
  if (!health.ok) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  clientInstance = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return clientInstance;
}

export const createRouteHandlerClient = createServerClient;

export function isMockMode(): boolean {
  return !getDbHealth().ok;
}
