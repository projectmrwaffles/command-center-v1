import { NextResponse } from "next/server";
import { verifyAgentKey, getServiceClient } from "@/lib/agent-auth";

const ALLOWED_FIELDS = ["status", "summary"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await verifyAgentKey(request);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Only allow updating allowlisted fields
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.includes(key)) {
      return NextResponse.json(
        { error: `Forbidden: cannot update field '${key}'` },
        { status: 403 }
      );
    }
    updates[key] = body[key];
  }

  const svc = getServiceClient();

  // Verify agent owns this job
  const { data: job, error: jobErr } = await svc
    .from("jobs")
    .select("id, owner_agent_id")
    .eq("id", id)
    .single();

  if (jobErr || !job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.owner_agent_id !== agent.id) {
    return NextResponse.json({ error: "Forbidden: not your job" }, { status: 403 });
  }

  updates.updated_at = new Date().toISOString();
  const { data, error } = await svc
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
