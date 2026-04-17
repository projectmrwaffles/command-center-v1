#!/usr/bin/env node
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { execFileSync } = require("node:child_process");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function minutesSince(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 60000));
}

function normalizeStatus(taskStatus) {
  if (taskStatus === "done") return "completed";
  if (taskStatus === "in_progress") return "in_progress";
  if (taskStatus === "blocked") return "blocked";
  return "queued";
}

async function main() {
  const [jobsRes, tasksRes, agentsRes] = await Promise.all([
    db.from("jobs").select("id, summary, status, updated_at, created_at, owner_agent_id").order("updated_at", { ascending: false }),
    db.from("sprint_items").select("id, status, assignee_agent_id"),
    db.from("agents").select("id, last_seen, current_job_id"),
  ]);
  if (jobsRes.error) throw jobsRes.error;
  if (tasksRes.error) throw tasksRes.error;
  if (agentsRes.error) throw agentsRes.error;

  const jobs = jobsRes.data || [];
  const tasks = tasksRes.data || [];
  const agents = agentsRes.data || [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const jobIds = new Set(jobs.map((job) => job.id));

  let duplicateGroups = 0;
  const seen = new Map();
  for (const job of jobs) {
    const key = `${job.owner_agent_id || "none"}|${job.summary || "none"}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const count of seen.values()) if (count > 1) duplicateGroups += 1;

  let orphanTaskJobs = 0;
  let orphanHistoryJobs = 0;
  let mismatchedJobs = 0;
  let staleQueuedJobs = 0;
  let orphanCurrentJobRefs = 0;
  for (const job of jobs) {
    if (job.status === "queued") {
      const age = minutesSince(job.updated_at || job.created_at);
      if (age != null && age >= 15) staleQueuedJobs += 1;
    }
    const match = /^task:(.+)$/.exec(job.summary || "");
    if (!match) continue;
    const task = taskById.get(match[1]);
    if (!task) {
      orphanTaskJobs += 1;
      if (job.status === "completed") orphanHistoryJobs += 1;
      continue;
    }
    if (job.status !== normalizeStatus(task.status) || job.owner_agent_id !== task.assignee_agent_id) {
      mismatchedJobs += 1;
    }
  }

  for (const agent of agents) {
    if (agent.current_job_id && !jobIds.has(agent.current_job_id)) {
      orphanCurrentJobRefs += 1;
    }
  }

  const recentAgents = agents.filter((agent) => {
    const ts = agent.last_seen ? new Date(agent.last_seen).getTime() : Number.NaN;
    return Number.isFinite(ts) && Date.now() - ts <= 5 * 60 * 1000;
  }).length;

  let openclawStatus = null;
  try {
    openclawStatus = JSON.parse(execFileSync("openclaw", ["status", "--json"], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 * 4 }));
  } catch (error) {
    console.error("WARN openclaw status unavailable:", error.message);
  }

  const failures = [];
  if (duplicateGroups > 0) failures.push(`duplicate job groups=${duplicateGroups}`);
  if (orphanTaskJobs > orphanHistoryJobs) failures.push(`active orphan task jobs=${orphanTaskJobs - orphanHistoryJobs}`);
  if (mismatchedJobs > 0) failures.push(`mismatched jobs=${mismatchedJobs}`);
  if (staleQueuedJobs > 0) failures.push(`stale queued jobs=${staleQueuedJobs}`);
  if (orphanCurrentJobRefs > 0) failures.push(`orphan current_job_id refs=${orphanCurrentJobRefs}`);
  if (!openclawStatus?.gatewayService?.installed || !openclawStatus?.nodeService?.installed) failures.push("openclaw services not confirmed installed");
  if (!String(openclawStatus?.gatewayService?.runtimeShort || "").includes("running") || !String(openclawStatus?.nodeService?.runtimeShort || "").includes("running")) {
    failures.push("openclaw services not healthy/running");
  }

  const report = {
    checkedAt: new Date().toISOString(),
    duplicateGroups,
    orphanTaskJobs,
    orphanHistoryJobs,
    mismatchedJobs,
    staleQueuedJobs,
    orphanCurrentJobRefs,
    recentAgents,
    gatewayService: openclawStatus?.gatewayService?.runtimeShort || null,
    nodeService: openclawStatus?.nodeService?.runtimeShort || null,
    ok: failures.length === 0,
    failures,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
