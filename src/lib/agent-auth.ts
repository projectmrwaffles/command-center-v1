import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Verify X-Agent-Key header against agents.api_key_hash.
 * Returns the agent row if valid, null otherwise.
 * MVP: plaintext match on api_key_hash column (hash in production).
 */
export async function verifyAgentKey(
  request: Request
): Promise<{ id: string; name: string } | null> {
  const key = request.headers.get("x-agent-key");
  if (!key) return null;

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await svc
    .from("agents")
    .select("id, name")
    .eq("api_key_hash", key)
    .single();

  if (error || !data) return null;
  return data;
}

/** Get a service_role Supabase client for trusted server-side ops */
export function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
