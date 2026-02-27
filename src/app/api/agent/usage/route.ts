import { NextResponse } from "next/server";
import { verifyAgentKey, getServiceClient } from "@/lib/agent-auth";

export async function POST(request: Request) {
  const agent = await verifyAgentKey(request);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  if (body.agent_id && body.agent_id !== agent.id) {
    return NextResponse.json({ error: "Forbidden: agent_id mismatch" }, { status: 403 });
  }

  const svc = getServiceClient();
  const { data, error } = await svc.from("ai_usage").insert({
    agent_id: agent.id,
    provider: body.provider,
    model: body.model,
    tokens_in: body.tokens_in || 0,
    tokens_out: body.tokens_out || 0,
    total_tokens: body.total_tokens || 0,
    cost_usd: body.cost_usd || null,
  }).select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
