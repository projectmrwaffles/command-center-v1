import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { authorizeApiRequest } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const auth = authorizeApiRequest(req, { allowSameOrigin: true, bearerEnvNames: ["AGENT_AUTH_TOKEN"] });
  if (!auth.ok) return auth.response;
  try {
    // Get live sessions from OpenClaw
    const sessionsOutput = execSync("openclaw sessions", {
      encoding: "utf8",
      timeout: 10000,
    });

    // Get agent status
    const statusOutput = execSync("openclaw status --json", {
      encoding: "utf8",
      timeout: 10000,
    });

    // Parse sessions
    const lines = sessionsOutput.split("\n").filter((l) => l.includes("direct") || l.includes("agent:"));
    const sessions = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        key: parts[1] || "",
        age: parts[2] || "",
        model: parts[3] || "",
        tokens: parts[4] || "",
      };
    });

    // Parse status for agent heartbeat info
    let heartbeatAgents = [];
    try {
      const status = JSON.parse(statusOutput);
      heartbeatAgents = status.heartbeat?.agents || [];
    } catch {
      // Ignore parse errors
    }

    return NextResponse.json({
      sessions,
      heartbeatAgents,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch OpenClaw status", detail: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}