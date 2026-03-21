#!/usr/bin/env node
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { spawn } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function getEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logResult(ok, name, detail) {
  const prefix = ok ? "PASS" : "FAIL";
  console.log(`${prefix} - ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) {
    throw new Error(name);
  }
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/webhook`);
      if (response.ok) return;
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(750);
  }

  throw lastError || new Error("Server did not become ready in time");
}

function createJsonClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "internal-ready-smoke" } },
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { response, json, text };
}

function getTrustedHeaders(baseUrl, agentToken) {
  if (agentToken) {
    return { Authorization: `Bearer ${agentToken}` };
  }

  return {
    Origin: baseUrl,
    Referer: `${baseUrl}/dashboard`,
  };
}

async function cleanupProject(service, projectId) {
  if (!projectId) return;

  const { data: tasks } = await service
    .from("sprint_items")
    .select("id")
    .eq("project_id", projectId);

  const taskIds = (tasks || []).map((task) => task.id).filter(Boolean);

  try {
    if (taskIds.length > 0) {
      await service.from("agent_notifications").delete().in("task_id", taskIds);
    }
  } catch {
    // Optional table.
  }

  await service.from("project_documents").delete().eq("project_id", projectId);
  await service.from("artifacts").delete().eq("project_id", projectId);
  await service.from("approvals").delete().eq("project_id", projectId);
  await service.from("ai_usage").delete().eq("project_id", projectId);
  await service.from("agent_events").delete().eq("project_id", projectId);
  await service.from("jobs").delete().eq("project_id", projectId);
  await service.from("prds").delete().eq("project_id", projectId);
  await service.from("sprint_items").delete().eq("project_id", projectId);
  await service.from("sprints").delete().eq("project_id", projectId);
  await service.from("projects").delete().eq("id", projectId);
}

async function main() {
  for (const name of REQUIRED_ENV) getEnv(name);

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const agentToken = process.env.AGENT_AUTH_TOKEN?.trim() || "";

  const anon = createJsonClient(supabaseUrl, anonKey);
  const service = createJsonClient(supabaseUrl, serviceKey);

  const port = String(process.env.SMOKE_PORT || 3210);
  const baseUrl = process.env.SMOKE_BASE_URL?.trim() || `http://127.0.0.1:${port}`;
  const startLocalServer = process.env.SMOKE_BASE_URL ? false : process.env.SMOKE_START_LOCAL_SERVER !== "0";

  let serverProcess = null;
  let createdProjectId = null;

  try {
    const restrictedAnonReads = [
      { table: "team_members", label: "internal team membership", requireServiceRows: true },
      { table: "projects", label: "projects", requireServiceRows: true },
      { table: "sprints", label: "sprints", requireServiceRows: true },
      { table: "sprint_items", label: "sprint items", requireServiceRows: true },
      { table: "agents", label: "agents", requireServiceRows: true },
      { table: "jobs", label: "jobs", requireServiceRows: false },
      { table: "approvals", label: "approvals", requireServiceRows: false },
      { table: "project_documents", label: "project documents", requireServiceRows: false },
      { table: "prds", label: "PRDs", requireServiceRows: false },
      { table: "agent_events", label: "agent events", requireServiceRows: false },
    ];

    for (const check of restrictedAnonReads) {
      const { count: serviceCount, error: serviceError } = await service
        .from(check.table)
        .select("id", { count: "exact", head: true });
      if (serviceError) throw serviceError;

      const { count: anonCount, error: anonError } = await anon
        .from(check.table)
        .select("id", { count: "exact", head: true });
      if (anonError) throw anonError;

      const serviceHasRows = Number(serviceCount || 0) > 0;
      const ok = Number(anonCount || 0) === 0 && (!check.requireServiceRows || serviceHasRows);

      logResult(
        ok,
        `anon cannot read ${check.label}`,
        `table ${check.table}: service sees ${serviceCount ?? 0}, anon sees ${anonCount ?? 0}`
      );
    }

    if (startLocalServer) {
      serverProcess = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", port], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });
      serverProcess.stdout.on("data", () => {});
      serverProcess.stderr.on("data", () => {});
      await waitForServer(baseUrl);
      logResult(true, "local app server started", baseUrl);
    }

    const trustedHeaders = getTrustedHeaders(baseUrl, agentToken);

    const unauthorizedProjects = await fetchJson(`${baseUrl}/api/projects`);
    logResult(
      unauthorizedProjects.response.status === 401,
      "projects API rejects unauthorized requests",
      `status ${unauthorizedProjects.response.status}`
    );

    const authorizedProjects = await fetchJson(`${baseUrl}/api/projects`, {
      headers: trustedHeaders,
    });
    logResult(
      authorizedProjects.response.ok && Array.isArray(authorizedProjects.json?.projects),
      "projects API accepts trusted internal requests",
      `${authorizedProjects.json?.projects?.length ?? 0} projects returned`
    );

    const createProject = await fetchJson(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: {
        ...trustedHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Internal Ready Smoke ${Date.now()}`,
        type: "ops_enablement",
        description: "Disposable smoke project for backend closeout verification.",
        links: {
          github: "https://github.com/vercel/next.js",
          docs: "https://nextjs.org/docs",
        },
        intake: {
          summary: "Smoke-check intake",
          goals: ["Verify closeout readiness"],
          teamIds: [],
          links: { docs: "https://example.com/intake" },
        },
      }),
    });

    createdProjectId = createProject.json?.project?.id || null;
    logResult(
      createProject.response.status === 201 && Boolean(createdProjectId),
      "project creation succeeds through trusted API path",
      `project ${createdProjectId || "missing"}`
    );

    const { data: sprints, error: sprintsError } = await service
      .from("sprints")
      .select("id, name, status")
      .eq("project_id", createdProjectId)
      .order("created_at", { ascending: true });
    if (sprintsError) throw sprintsError;
    logResult(
      (sprints || []).length >= 2,
      "project bootstrap keeps phased kickoff even on legacy schema",
      `${(sprints || []).length} sprint(s)`
    );

    const { data: tasks, error: tasksError } = await service
      .from("sprint_items")
      .select("id, project_id, status")
      .eq("project_id", createdProjectId)
      .order("position", { ascending: true })
      .limit(1);
    if (tasksError) throw tasksError;
    const task = tasks?.[0];
    logResult(Boolean(task?.id), "project bootstrap creates an initial task", task?.id || "no task found");

    const invalidDoc = await fetchJson(`${baseUrl}/api/projects/${createdProjectId}/documents`, {
      method: "POST",
      headers: {
        ...trustedHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: [{ type: "pdf", title: "", storage_path: "", mime_type: "application/pdf", size_bytes: -1 }],
      }),
    });
    logResult(
      invalidDoc.response.status === 400,
      "documents API rejects malformed payloads",
      invalidDoc.json?.error || `status ${invalidDoc.response.status}`
    );

    const validDoc = await fetchJson(`${baseUrl}/api/projects/${createdProjectId}/documents`, {
      method: "POST",
      headers: {
        ...trustedHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: [{
          type: "pdf",
          title: "Internal Ready Proof",
          storage_path: `project_docs/${createdProjectId}/proof.pdf`,
          mime_type: "application/pdf",
          size_bytes: 1024,
        }],
      }),
    });
    const insertedDoc = validDoc.json?.documents?.[0];
    logResult(
      validDoc.response.status === 201 && insertedDoc?.type === "prd_pdf",
      "documents API sanitizes and persists valid uploads",
      insertedDoc ? `${insertedDoc.title} (${insertedDoc.type})` : "document missing"
    );

    if (agentToken) {
      const taskUpdateConflict = await fetchJson(`${baseUrl}/api/agent/log`, {
        method: "POST",
        headers: {
          ...trustedHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "task_update",
          data: {
            task_id: task.id,
            project_id: "00000000-0000-0000-0000-000000000000",
            status: "done",
          },
        }),
      });
      logResult(
        taskUpdateConflict.response.status === 409,
        "agent task updates reject cross-project tampering",
        taskUpdateConflict.json?.error || `status ${taskUpdateConflict.response.status}`
      );

      const taskUpdateOk = await fetchJson(`${baseUrl}/api/agent/log`, {
        method: "POST",
        headers: {
          ...trustedHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "task_update",
          data: {
            task_id: task.id,
            project_id: createdProjectId,
            status: "in_progress",
            description: "Smoke verification in progress",
          },
        }),
      });
      logResult(
        taskUpdateOk.response.ok && taskUpdateOk.json?.project_id === createdProjectId,
        "agent task updates succeed within project scope",
        taskUpdateOk.json?.project_id || `status ${taskUpdateOk.response.status}`
      );

      const { data: taskAfterUpdate, error: taskAfterUpdateError } = await service
        .from("sprint_items")
        .select("status")
        .eq("id", task.id)
        .single();
      if (taskAfterUpdateError) throw taskAfterUpdateError;
      logResult(
        taskAfterUpdate?.status === "in_progress",
        "task update writes back sprint item status",
        taskAfterUpdate?.status || "missing"
      );

      const { data: createdJobs, error: createdJobsError } = await service
        .from("jobs")
        .select("id, status, summary")
        .eq("project_id", createdProjectId)
        .eq("summary", `task:${task.id}`);
      if (createdJobsError) throw createdJobsError;
      logResult(
        (createdJobs || []).some((job) => job.status === "in_progress"),
        "task update creates visible job movement",
        JSON.stringify(createdJobs || [])
      );

      const { data: taskEvents, error: taskEventsError } = await service
        .from("agent_events")
        .select("id, event_type, payload")
        .eq("project_id", createdProjectId)
        .in("event_type", ["task_status_changed", "task_completed", "task_blocked"]);
      if (taskEventsError) throw taskEventsError;
      logResult(
        (taskEvents || []).length > 0,
        "task update writes visible agent event movement",
        `${(taskEvents || []).length} event(s)`
      );

      const { data: projectAfterUpdate, error: projectAfterUpdateError } = await service
        .from("projects")
        .select("status, progress_pct")
        .eq("id", createdProjectId)
        .single();
      if (projectAfterUpdateError) throw projectAfterUpdateError;
      logResult(
        projectAfterUpdate?.status === "active" && Number.isFinite(projectAfterUpdate?.progress_pct),
        "task update syncs project state",
        JSON.stringify(projectAfterUpdate)
      );

      const invalidUsage = await fetchJson(`${baseUrl}/api/agent/log`, {
        method: "POST",
        headers: {
          ...trustedHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "usage",
          data: {
            agent_id: "11111111-1111-1111-1111-000000000008",
            model: "gpt-5.4",
            provider: "openai",
            project_id: createdProjectId,
            tokens_in: -1,
            tokens_out: 10,
            cost_usd: 0.01,
          },
        }),
      });
      logResult(
        invalidUsage.response.status === 400,
        "usage logging rejects negative metrics",
        invalidUsage.json?.error || `status ${invalidUsage.response.status}`
      );

      const validUsage = await fetchJson(`${baseUrl}/api/agent/log`, {
        method: "POST",
        headers: {
          ...trustedHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "usage",
          data: {
            agent_id: "11111111-1111-1111-1111-000000000008",
            model: "gpt-5.4",
            provider: "openai",
            project_id: createdProjectId,
            tokens_in: 25,
            tokens_out: 75,
            cost_usd: 0.12,
          },
        }),
      });
      logResult(validUsage.response.ok, "usage logging accepts sane metrics", `status ${validUsage.response.status}`);
    } else {
      const anonEventInsert = await anon.from("agent_events").insert({
        agent_id: "11111111-1111-1111-1111-000000000008",
        event_type: "smoke_anon_insert_attempt",
        project_id: createdProjectId,
        payload: { source: "internal-ready-smoke" },
      });
      logResult(
        Boolean(anonEventInsert.error),
        "anon cannot write agent events directly",
        anonEventInsert.error?.message || "insert unexpectedly succeeded"
      );

      const serviceEventInsert = await service.from("agent_events").insert({
        agent_id: "11111111-1111-1111-1111-000000000008",
        event_type: "task_updated",
        project_id: createdProjectId,
        payload: { source: "internal-ready-smoke" },
      });
      logResult(
        !serviceEventInsert.error,
        "service role can write agent events for trusted backends",
        serviceEventInsert.error?.message || "service insert ok"
      );

      const anonUsageInsert = await anon.from("ai_usage").insert({
        agent_id: "11111111-1111-1111-1111-000000000008",
        model: "gpt-5.4",
        provider: "openai",
        project_id: createdProjectId,
        tokens_in: 1,
        tokens_out: 1,
        total_tokens: 2,
        cost_usd: 0.01,
      });
      logResult(
        Boolean(anonUsageInsert.error),
        "anon cannot write usage rows directly",
        anonUsageInsert.error?.message || "insert unexpectedly succeeded"
      );

      const serviceUsageInsert = await service.from("ai_usage").insert({
        agent_id: "11111111-1111-1111-1111-000000000008",
        model: "gpt-5.4",
        provider: "openai",
        project_id: createdProjectId,
        tokens_in: 25,
        tokens_out: 75,
        total_tokens: 100,
        cost_usd: 0.12,
      });
      logResult(
        !serviceUsageInsert.error,
        "service role can write usage rows for trusted backends",
        serviceUsageInsert.error?.message || "service insert ok"
      );
    }

    const docsReadback = await fetchJson(`${baseUrl}/api/projects/${createdProjectId}/documents`, {
      headers: trustedHeaders,
    });
    const docCount = docsReadback.json?.documents?.length ?? 0;
    logResult(
      docsReadback.response.ok && docCount >= 1,
      "document readback returns persisted records",
      `${docCount} document(s)`
    );

    console.log(`SMOKE_PROJECT_ID=${createdProjectId}`);
  } finally {
    await cleanupProject(service, createdProjectId);

    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => serverProcess.once("exit", resolve)),
        sleep(5000),
      ]);
      if (!serverProcess.killed) {
        serverProcess.kill("SIGKILL");
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
