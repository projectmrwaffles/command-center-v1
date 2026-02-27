import { NextResponse } from "next/server";
import { verifyAgentKey, getServiceClient } from "@/lib/agent-auth";

export async function GET(request: Request) {
  const agent = await verifyAgentKey(request);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Agent can only read own record
  const svc = getServiceClient();
  const { data, error } = await svc
    .from("agents")
    .select("id, name, status, last_seen")
    .eq("id", agent.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
