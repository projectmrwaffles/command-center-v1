import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const baseUrl = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
const repoRoot = process.cwd();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function formatEventType(eventType) {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function listRecentProjects(limit = 80) {
  const { data, error } = await db
    .from("projects")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  assert.equal(error, null, error?.message || "Failed to load projects");
  return data || [];
}

async function getRecentSignals(projectId) {
  const [{ data: approvals, error: approvalsError }, { data: jobs, error: jobsError }, { data: events, error: eventsError }] = await Promise.all([
    db.from("approvals").select("id, summary, severity, status, created_at").eq("project_id", projectId).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
    db.from("jobs").select("id, title, status, updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(10),
    db.from("agent_events").select("id, event_type, payload, timestamp").eq("project_id", projectId).order("timestamp", { ascending: false }).limit(10),
  ]);
  assert.equal(approvalsError, null, approvalsError?.message || "Failed to load approvals");
  assert.equal(jobsError, null, jobsError?.message || "Failed to load jobs");
  assert.equal(eventsError, null, eventsError?.message || "Failed to load events");

  const recentSignals = [
    ...(approvals || []).map((approval) => ({ title: approval.summary || "Approval requested", timestamp: approval.created_at })),
    ...(jobs || []).map((job) => ({ title: job.title || (job.status === "blocked" ? "Blocked job" : job.status === "queued" ? "Queued job" : "Active job"), timestamp: job.updated_at || new Date().toISOString() })),
    ...(events || []).map((event) => ({ title: formatEventType(event.event_type), timestamp: event.timestamp })),
  ]
    .filter((item) => item.title && item.timestamp)
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));

  return recentSignals;
}

async function findSample() {
  const projects = await listRecentProjects();
  for (const project of projects) {
    const recentSignals = await getRecentSignals(project.id);
    if (recentSignals.length > 0) return { project, recentSignals };
  }
  throw new Error("No project with recent updates found");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const sample = await findSample();
  const expectedTitle = sample.recentSignals[0].title;
  const url = `${baseUrl}/projects/${sample.project.id}`;
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.ok(response && response.ok(), `Failed to open ${url}`);

  await page.waitForFunction(() => document.body?.innerText?.includes("Recent updates"), undefined, { timeout: 15000 });
  await page.waitForFunction(() => document.body?.innerText?.includes("Project activity") || document.body?.innerText?.includes("Resolver fallback"), undefined, { timeout: 15000 });
  await page.waitForFunction((title) => document.body?.innerText?.includes(title), expectedTitle, { timeout: 15000 });

  console.log("verify-project-detail-truth-slice6: ok", JSON.stringify({
    projectId: sample.project.id,
    projectName: sample.project.name,
    verifiedTitle: expectedTitle,
    recentSignalCount: sample.recentSignals.length,
    url,
  }, null, 2));
} finally {
  await browser.close();
}
