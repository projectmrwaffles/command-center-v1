import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { getRequiredEnv } from "@/lib/server-auth";

const SUPABASE_URL = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

function hashAgentKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify X-Agent-Key header against agents.api_key_hash.
 * Supports sha256 digests and legacy plaintext rows for migration safety.
 */
export async function verifyAgentKey(
  request: Request
): Promise<{ id: string; name: string } | null> {
  const key = request.headers.get("x-agent-key");
  if (!key) return null;

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const hashedKey = hashAgentKey(key);
  const { data, error } = await svc
    .from("agents")
    .select("id, name, api_key_hash")
    .or(`api_key_hash.eq.${hashedKey},api_key_hash.eq.${key}`)
    .limit(5);

  if (error || !data?.length) return null;

  const matched = data.find((row) =>
    typeof row.api_key_hash === "string" && (
      safeCompare(row.api_key_hash, hashedKey) || safeCompare(row.api_key_hash, key)
    )
  );

  return matched ? { id: matched.id, name: matched.name } : null;
}

export function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
