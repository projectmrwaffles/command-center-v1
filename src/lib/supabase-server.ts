import { createClient } from "@supabase/supabase-js";

// Check if Supabase credentials are available
const hasCredentials = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(url && key);
};

// Mock client for demo mode
const createMockClient = () => {
  const mockData = {
    agents: [] as { id: string; name: string; type: string; status: string; last_seen: string | null }[],
    agent_events: [] as { id: string; agent_id: string; event_type: string; payload: object; timestamp: string }[],
    approvals: [] as { id: string; status: string; summary: string; note: string; decided_at: string | null; agent_id: string; job_id: string; created_at: string }[],
    projects: [] as { id: string; title: string; status: string; created_at: string; agent_id: string }[],
    jobs: [] as { id: string; status: string; updated_at: string }[],
  };

  return {
    from: (table: keyof typeof mockData) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          order: () => ({ limit: () => ({ data: [], error: null }) }),
        }),
        order: (column: string, opts: { ascending: boolean }) => ({
          limit: (n: number) => ({ data: mockData[table].slice(0, n), error: null }),
          data: mockData[table],
          error: null,
        }),
        data: mockData[table],
        error: null,
      }),
      single: async () => ({ data: null, error: null }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  } as unknown as ReturnType<typeof createClient>;
};

let clientInstance: any | null = null;

export function createServerClient(): any {
  if (clientInstance) {
    return clientInstance;
  }

  if (!hasCredentials()) {
    return createMockClient();
  }

  clientInstance = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  return clientInstance;
}

export function isMockMode() {
  return !hasCredentials();
}
