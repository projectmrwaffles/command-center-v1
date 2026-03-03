#!/usr/bin/env tsx
// Agent simulation script for testing realtime + rollups
// Run: npx tsx scripts/sim-agent.ts

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const SUPABASE_URL = "https://yhyxxjeiogvgdsfvdkfx.supabase.co";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIxOTUzNiwiZXhwIjoyMDg3Nzk1NTM2fQ.7AeC5aTtgzPhDoKNNv-8LERzWJKdf7L-x4bLJITF6z8";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function simulateAgentHeartbeat() {
  console.log("[Sim] Sending heartbeat for AgentA...");

  // Update agent last_seen
  const { error: agentErr } = await db
    .from("agents")
    .update({ last_seen: new Date().toISOString(), status: "active" })
    .eq("id", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

  if (agentErr) console.error("[Sim] Agent update error:", agentErr);
  else console.log("[Sim] Agent heartbeat updated");

  // Insert usage event (triggers rollup to usage_rollup_minute)
  const costUsd = 0.002 + Math.random() * 0.01;

  const { error: usageErr } = await db.from("ai_usage_events").insert({
    agent_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    project_id: "11111111-1111-1111-1111-111111111111",
    job_id: "eeee0001-0001-0001-0001-000000000001",
    provider: "openai",
    model: "gpt-4o",
    tokens_in: 800,
    tokens_out: 300,
    total_tokens: 1100,
    cost_usd: costUsd.toFixed(6),
    meta: { sim: true, timestamp: new Date().toISOString() },
  });

  if (usageErr) console.error("[Sim] Usage insert error:", usageErr);
  else console.log("[Sim] Usage event inserted, cost:", costUsd.toFixed(6));

  // Insert event
  const { error: eventErr } = await db.from("agent_events").insert({
    agent_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    event_type: "HEARTBEAT",
    payload: { status: "active", version: "1.0.1", agent_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    timestamp: new Date().toISOString(),
  });

  if (eventErr) console.error("[Sim] Event insert error:", eventErr);
  else console.log("[Sim] Heartbeat event inserted");
}

async function simulateSprintProgressUpdate() {
  console.log("[Sim] Updating sprint item status...");

  // Get a todo item and mark it done
  const { data: items } = await db
    .from("sprint_items")
    .select("id, sprint_id, project_id, status")
    .eq("status", "todo")
    .limit(1);

  if (!items || items.length === 0) {
    console.log("[Sim] No todo items found to update");
    return;
  }

  const item = items[0];
  console.log("[Sim] Updating item", item.id, "to 'done'");

  const { error } = await db
    .from("sprint_items")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", item.id);

  if (error) console.error("[Sim] Sprint item update error:", error);
  else console.log("[Sim] Sprint item updated to 'done' (triggers progress recalc)");
}

async function verifyRollups() {
  console.log("\n[Sim] Verifying rollups...");

  // Check usage_rollup_minute
  const { data: rollup } = await db
    .from("usage_rollup_minute")
    .select("*")
    .order("bucket_minute", { ascending: false })
    .limit(5);

  console.log("[Sim] usage_rollup_minute (last 5):");
  console.table(rollup);

  // Check projects.progress_pct
  const { data: projects } = await db
    .from("projects")
    .select("id, name, progress_pct")
    .order("name");

  console.log("[Sim] projects progress_pct:");
  console.table(projects);

  // Check sprints.progress_pct
  const { data: sprints } = await db
    .from("sprints")
    .select("id, name, status, progress_pct")
    .order("name");

  console.log("[Sim] sprints progress_pct:");
  console.table(sprints);
}

async function main() {
  console.log("=== Agent Simulation Script ===\n");
  console.log("Target:", SUPABASE_URL);
  console.log("Operations: heartbeat, usage insert, sprint update\n");

  await simulateAgentHeartbeat();
  await simulateSprintProgressUpdate();
  await verifyRollups();

  console.log("\n=== Done ===");
  console.log("Check the UI at http://localhost:3000 - it should update live without refresh.");
}

main().catch(console.error);
