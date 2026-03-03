"use client";

import { getDbHealth } from "@/lib/supabase-server";

export function DbBanner() {
  const health = getDbHealth();
  if (health.ok) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <p className="font-medium text-amber-800">Database not initialized</p>
      <p className="mt-1 text-amber-700">
        {health.reason === "env_missing" && (
          <span>
            Missing Supabase environment variables. Set{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            {` in .env.local (local dev) or Vercel Dashboard (production).`}
          </span>
        )}
        {health.reason === "db_not_initialized" && (
          <span>
            Tables missing. Apply migrations in Supabase SQL Editor: run{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">20250301130000_v1_schema.sql</code>
            {` then `}
            <code className="rounded bg-amber-100 px-1 font-mono">20250301130001_v1_seed.sql</code>.
          </span>
        )}
      </p>
    </div>
  );
}
