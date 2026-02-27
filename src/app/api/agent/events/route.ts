import { NextResponse } from "next/server";
import { verifyAgentKey, getServiceClient } from "@/lib/agent-auth";

export async function POST(request: Request) {
  const agent = await verifyAgentKey(request);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Reject if payload claims a different agent
  if (body.agent_id && body.agent_id !== agent.id) {
    return NextResponse.json({ error: "Forbidden: agent_id mismatch" }, { status: 403 });
  }

  const svc = getServiceClient();
  const { data, error } = await svc.from("agent_events").insert({
    agent_id: agent.id, // always overwrite from verified key
    event_type: body.event_type,
    project_id: body.project_id || null,
    job_id: body.job_id || null,
    payload: body.payload || {},
  }).select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
