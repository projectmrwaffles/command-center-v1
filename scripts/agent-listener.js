#!/usr/bin/env node

/**
 * Agent Listener Script
 *
 * This script runs on the Mac mini and listens for task assignments from Command Center.
 * When a new task is assigned to an agent (status=todo), it triggers the OpenClaw agent
 * to start working on that task.
 *
 * Usage:
 *   node agent-listener.js [--agent-id <agent-id>] [--agent-name <agent-name>]
 */

const { createClient } = require("@supabase/supabase-js");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const RECONCILE_INTERVAL_MS = 15 * 1000;
const REPO_ROOT = path.resolve(__dirname, "..");
const INTERNAL_BASE_URL = (process.env.AGENT_LOG_BASE_URL || process.env.INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const DEFAULT_OPENCLAW_BIN = path.join(process.env.HOME || "", ".npm-global/bin/openclaw");
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || (fs.existsSync(DEFAULT_OPENCLAW_BIN) ? DEFAULT_OPENCLAW_BIN : "openclaw");
const LOCK_DIR = process.env.AGENT_LISTENER_LOCK_DIR || "/tmp/command-center-agent-listeners";

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { agentId: null, agentName: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--agent-id" && args[i + 1]) {
      config.agentId = args[i + 1];
      i++;
    } else if (args[i] === "--agent-name" && args[i + 1]) {
      config.agentName = args[i + 1];
      i++;
    }
  }

  return config;
}

function loadEnv() {
  const envPath = path.join(REPO_ROOT, ".env.local");
  const defaultsPath = path.join(REPO_ROOT, ".env");
  let envFile = envPath;

  if (!fs.existsSync(envPath) && fs.existsSync(defaultsPath)) {
    envFile = defaultsPath;
  }

  if (!fs.existsSync(envFile)) return;

  const envContent = fs.readFileSync(envFile, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const AGENT_MAP = {
  "11111111-1111-1111-1111-000000000001": "main",
  "11111111-1111-1111-1111-000000000002": "product-lead",
  "11111111-1111-1111-1111-000000000003": "head-of-design",
  "11111111-1111-1111-1111-000000000004": "product-designer-app",
  "11111111-1111-1111-1111-000000000005": "web-designer-marketing",
  "11111111-1111-1111-1111-000000000006": "tech-lead-architect",
  "11111111-1111-1111-1111-000000000007": "frontend-engineer",
  "11111111-1111-1111-1111-000000000008": "backend-engineer",
  "11111111-1111-1111-1111-000000000009": "mobile-engineer",
  "11111111-1111-1111-1111-000000000010": "seo-web-developer",
  "11111111-1111-1111-1111-000000000011": "growth-lead",
  "11111111-1111-1111-1111-000000000012": "marketing-producer",
  "11111111-1111-1111-1111-000000000013": "marketing-ops-analytics",
  "11111111-1111-1111-1111-000000000014": "qa-auditor",
};

function getAgentNameFromId(agentId) {
  return AGENT_MAP[agentId] || null;
}

function getAgentIdFromName(agentName) {
  const entry = Object.entries(AGENT_MAP).find(([_, name]) => name === agentName);
  return entry ? entry[0] : null;
}

async function getProjectExecutionContext(supabase, projectId) {
  if (!projectId) {
    return {
      id: null,
      name: "Unknown Project",
      type: null,
      intake: null,
      links: null,
      github_repo_binding: null,
    };
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, type, intake, links, github_repo_binding")
    .eq("id", projectId)
    .single();
  if (error) {
    console.error("[Listener] Error fetching project execution context:", error);
    return {
      id: projectId,
      name: "Unknown Project",
      type: null,
      intake: null,
      links: null,
      github_repo_binding: null,
    };
  }
  return {
    id: data?.id || projectId,
    name: data?.name || "Unknown Project",
    type: data?.type || null,
    intake: data?.intake || null,
    links: data?.links || null,
    github_repo_binding: data?.github_repo_binding || null,
  };
}

async function markTaskInProgress(adminSupabase, agentId, taskId, projectId, taskTitle) {
  if (!adminSupabase || !agentId || !taskId) return false;

  const timestamp = new Date().toISOString();
  const taskUpdate = await adminSupabase
    .from("sprint_items")
    .update({ status: "in_progress" })
    .eq("id", taskId)
    .eq("assignee_agent_id", agentId)
    .eq("status", "todo")
    .select("id")
    .maybeSingle();
  if (taskUpdate.error) {
    console.error(`[Listener] Failed to mark task ${taskId} in_progress:`, taskUpdate.error);
    return false;
  }
  if (!taskUpdate.data?.id) {
    console.log(`[Listener] Task ${taskId} was already claimed before this listener could start it`);
    return false;
  }

  const summaryKey = `task:${taskId}`;
  const existingJob = await adminSupabase
    .from("jobs")
    .select("id")
    .eq("summary", summaryKey)
    .eq("owner_agent_id", agentId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let jobId = null;
  if (existingJob.error) {
    console.error(`[Listener] Failed to load existing job for task ${taskId}:`, existingJob.error);
  } else if (existingJob.data?.id) {
    jobId = existingJob.data.id;
    const jobUpdate = await adminSupabase
      .from("jobs")
      .update({
        project_id: projectId || null,
        title: taskTitle || "New task",
        status: "in_progress",
        updated_at: timestamp,
      })
      .eq("id", jobId);
    if (jobUpdate.error) console.error(`[Listener] Failed to update existing job ${jobId}:`, jobUpdate.error);
  } else {
    const jobResult = await adminSupabase
      .from("jobs")
      .insert({ project_id: projectId || null, owner_agent_id: agentId, title: taskTitle || "New task", status: "in_progress", summary: summaryKey })
      .select("id")
      .single();

    if (jobResult.error) {
      console.error(`[Listener] Failed to create job for task ${taskId}:`, jobResult.error);
    } else {
      jobId = jobResult.data?.id || null;
    }
  }

  const agentUpdate = await adminSupabase.from("agents").update({ status: "active", last_seen: timestamp, current_job_id: jobId }).eq("id", agentId);
  if (agentUpdate.error) console.error(`[Listener] Failed to update agent ${agentId} status:`, agentUpdate.error);

  const eventInsert = await adminSupabase.from("agent_events").insert({
    agent_id: agentId,
    event_type: "task_status_changed",
    project_id: projectId || null,
    job_id: jobId,
    payload: { task_id: taskId, title: taskTitle || "New task", status: "in_progress", message: `${taskTitle || "Task"} moved to in progress by listener dispatch` },
  });
  if (eventInsert.error) console.error(`[Listener] Failed to insert event for task ${taskId}:`, eventInsert.error);
  return true;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function resolveGithubRepoUrl(project) {
  return project?.github_repo_binding?.url || project?.links?.github || project?.intake?.links?.github || null;
}

function getRepoSlugFromUrl(url) {
  const normalized = String(url || "").trim().replace(/\.git$/i, "");
  const match = normalized.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
  return match?.[2] || null;
}

function resolveRepoWorkspacePath(project) {
  const repoSlug = getRepoSlugFromUrl(resolveGithubRepoUrl(project));
  if (!repoSlug) return null;

  const openClawRoot = path.join(process.env.HOME || "", ".openclaw");
  const candidates = [
    path.join(openClawRoot, "workspace-product-lead", "projects", repoSlug),
    path.join(openClawRoot, "workspace-tech-lead-architect", "projects", repoSlug),
    path.join(openClawRoot, "workspace", "projects", repoSlug),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function isCodeHeavyProject(project) {
  const shape = String(project?.intake?.shape || project?.type || "").toLowerCase();
  return ["saas-product", "web-app", "native-app", "ops-system", "saas", "web_app", "native_app", "ops_system"].includes(shape);
}

function buildAgentMessage({ project, taskTitle, taskId, projectId, taskType, taskMetadata }) {
  const projectName = project?.name || "Unknown Project";
  const githubRepoUrl = resolveGithubRepoUrl(project);
  const repoWorkspacePath = resolveRepoWorkspacePath(project);
  const codeHeavy = isCodeHeavyProject(project) || Boolean(githubRepoUrl);
  const qaMode = String(taskMetadata?.qa_mode || "").toLowerCase();
  const isQaValidation = taskType === "qa_validation";
  const isAcceptanceReview = isQaValidation && qaMode === "acceptance_review";

  return [
    `New task for project "${projectName}": ${taskTitle}.`,
    `Task ID: ${taskId}.`,
    projectId ? `Project ID: ${projectId}.` : null,
    taskType ? `Task type: ${taskType}.` : null,
    qaMode ? `QA mode: ${qaMode}.` : null,
    githubRepoUrl ? `GitHub repo: ${githubRepoUrl}` : null,
    repoWorkspacePath ? `Repo workspace path: ${repoWorkspacePath}` : null,
    codeHeavy ? "This project is repo-backed. Use the exact repo workspace path above when you inspect or change implementation files; do not work in a separate scratch workspace." : null,
    isAcceptanceReview ? "This is a validation/sign-off task, not a greenfield implementation task. Validate the existing deliverables, repo state, and runtime evidence that already exist for this project." : null,
    isAcceptanceReview ? "Return STATUS: done when the acceptance review passes and the Validate task should close. Return STATUS: blocked only when you found a real failure or a concrete missing prerequisite that prevents sign-off." : null,
    isAcceptanceReview ? "Do not block just because you did not need to change code. If no repo change is required, say so explicitly in DETAILS and still finish with STATUS: done when validation passes." : null,
    codeHeavy ? "If you change tracked code or docs in that repo-backed workspace, do not stop at a local commit. Commit and push to the remote so origin reflects your final commit before you return STATUS: done." : null,
    codeHeavy ? "Verify the remote push succeeded. Include the pushed commit hash and the exact git/gh commands you ran in DETAILS when you make tracked changes." : null,
    "Do the work now. Do not stop after acknowledging or saying you started.",
    "Continue until you reach a real stop condition: done, blocked, awaiting approval, or awaiting confirmation.",
    "If you need workspace artifacts, create or update them before you stop.",
    "Return exactly this format:",
    "STATUS: done|blocked|awaiting_approval|awaiting_confirmation",
    "SUMMARY: <one-line summary>",
    "DETAILS:",
    "- <bullet>",
    "NEXT:",
    "- <bullet>",
  ].filter(Boolean).join("\n");
}

function looksLikeRealBlocker(text) {
  const value = String(text || "").toLowerCase();
  if (!value.trim()) return false;
  const blockerSignals = [
    /\bblocked\b/,
    /\bcannot\b/,
    /\bcan't\b/,
    /\bunable\b/,
    /\bfailed\b/,
    /\berror\b/,
    /\bmissing\b/,
    /\bwaiting for\b/,
    /\bneeds approval\b/,
    /\bneed approval\b/,
    /\bawaiting approval\b/,
    /\bawaiting confirmation\b/,
    /\brequires approval\b/,
    /\bprerequisite\b/,
    /\bdependency\b/,
    /\bpermission\b/,
    /\baccess\b/,
    /\bnot configured\b/,
    /\bnot available\b/,
    /\bno repo\b/,
    /\bno token\b/,
  ];
  return blockerSignals.some((pattern) => pattern.test(value));
}

function parseAgentResult(text) {
  const trimmed = String(text || "").trim();
  const statusMatch = trimmed.match(/^STATUS:\s*(.+)$/im);
  const summaryMatch = trimmed.match(/^SUMMARY:\s*(.+)$/im);
  const rawStatus = (statusMatch?.[1] || "").trim().toLowerCase();
  const status = rawStatus
    .replace(/[.`*]+$/g, "")
    .replace(/[\s-]+/g, "_");
  const summary = (summaryMatch?.[1] || trimmed.split(/\n+/)[0] || "No summary provided").trim();
  const hasRealBlockerSignal = looksLikeRealBlocker(`${summary}\n${trimmed}`);
  const isBlockedTerminal = status === "blocked" && hasRealBlockerSignal;
  const isTerminal = ["done", "awaiting_approval", "awaiting_confirmation"].includes(status) || isBlockedTerminal;
  const taskStatus = status === "done" || status === "awaiting_approval"
    ? "done"
    : status === "awaiting_confirmation" || isBlockedTerminal
      ? "blocked"
      : "in_progress";
  return {
    raw: trimmed,
    status,
    summary,
    isTerminal,
    taskStatus,
    hasRealBlockerSignal,
  };
}

function runExec(command) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: REPO_ROOT }, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

async function runAgentUntilStopCondition(agentName, initialMessage) {
  let sessionId = null;
  let latestResult = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const logPath = `/tmp/agent-${agentName}-${Date.now()}-${attempt}.log`;
    const message = attempt === 1 ? initialMessage : [
      "You have not reached a valid stop condition yet.",
      "Continue the same task now. Actually perform the work before replying.",
      "Do not acknowledge, narrate intent, or say you are starting.",
      "Do not use STATUS: blocked unless you are naming a concrete blocker, failure, missing prerequisite, approval hold, or access/config issue that truly prevents continuation right now.",
      "A progress update, intent statement, or implementation plan is NOT a blocker.",
      "Only stop when you can return the required final format with STATUS set to done, blocked, awaiting_approval, or awaiting_confirmation.",
    ].join("\n");

    const parts = [shellQuote(OPENCLAW_BIN), "agent", `--agent ${agentName}`, `--message ${shellQuote(message)}`, "--json", "--timeout 600"];
    if (sessionId) parts.push(`--session-id ${sessionId}`);
    const command = `${parts.join(" ")} > ${shellQuote(logPath)} 2>&1`;

    await runExec(command);

    const parsedLog = JSON.parse(fs.readFileSync(logPath, "utf8"));
    sessionId = parsedLog?.result?.meta?.agentMeta?.sessionId || sessionId;
    const text = parsedLog?.result?.payloads?.[0]?.text || "";
    latestResult = parseAgentResult(text);
    if (latestResult.isTerminal) return latestResult;
  }

  return {
    status: latestResult?.status === "blocked" && !latestResult?.hasRealBlockerSignal ? "in_progress" : "blocked",
    isTerminal: true,
    taskStatus: latestResult?.status === "blocked" && !latestResult?.hasRealBlockerSignal ? "in_progress" : "blocked",
    summary: latestResult?.status === "blocked" && !latestResult?.hasRealBlockerSignal
      ? "Agent returned a non-blocking progress update without a real blocker; execution should continue."
      : latestResult?.summary || "Agent never reached a terminal stop condition",
    raw: latestResult?.raw || "No agent output captured",
    hasRealBlockerSignal: Boolean(latestResult?.hasRealBlockerSignal),
  };
}

async function postTaskUpdateThroughApi(agentId, taskId, projectId, result) {
  const token = process.env.AGENT_AUTH_TOKEN?.trim();
  if (!token || !taskId) return { ok: false, reason: token ? "missing_task" : "missing_token" };

  const response = await fetch(`${INTERNAL_BASE_URL}/api/agent/log`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "task_update",
      data: {
        agent_id: agentId,
        task_id: taskId,
        project_id: projectId || undefined,
        status: result.taskStatus,
        description: result.summary,
      },
    }),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { ok: response.ok, status: response.status, json };
}

async function finalizeTaskRun(adminSupabase, agentId, taskId, projectId, taskTitle, result) {
  if (!adminSupabase || !agentId || !taskId) return;

  try {
    const apiResult = await postTaskUpdateThroughApi(agentId, taskId, projectId, result);
    if (apiResult.ok) {
      return;
    }
    console.warn(`[Listener] API task finalization fallback for task ${taskId}:`, apiResult);
  } catch (error) {
    console.warn(`[Listener] API task finalization failed for task ${taskId}, using legacy fallback:`, error?.message || error);
  }

  const timestamp = new Date().toISOString();
  const summaryKey = `task:${taskId}`;
  const taskStatus = result.taskStatus;
  const jobStatus = taskStatus === "done" ? "completed" : taskStatus === "blocked" ? "blocked" : "in_progress";

  const taskUpdate = await adminSupabase.from("sprint_items").update({ status: taskStatus, description: result.summary }).eq("id", taskId).eq("assignee_agent_id", agentId);
  if (taskUpdate.error) console.error(`[Listener] Failed to finalize task ${taskId}:`, taskUpdate.error);

  const existingJob = await adminSupabase.from("jobs").select("id").eq("summary", summaryKey).eq("owner_agent_id", agentId).limit(1).maybeSingle();
  let jobId = existingJob.data?.id || null;
  if (existingJob.error) {
    console.error(`[Listener] Failed to load job for task ${taskId}:`, existingJob.error);
  } else if (jobId) {
    const jobUpdate = await adminSupabase.from("jobs").update({ title: taskTitle || "New task", status: jobStatus, updated_at: timestamp }).eq("id", jobId);
    if (jobUpdate.error) console.error(`[Listener] Failed to update job ${jobId}:`, jobUpdate.error);
  }

  const agentStatus = taskStatus === "in_progress" ? "active" : "idle";
  const agentUpdate = await adminSupabase.from("agents").update({ status: agentStatus, last_seen: timestamp, current_job_id: taskStatus === "in_progress" ? jobId : null }).eq("id", agentId);
  if (agentUpdate.error) console.error(`[Listener] Failed to update agent ${agentId} after task ${taskId}:`, agentUpdate.error);

  const eventType = taskStatus === "done" ? "task_completed" : taskStatus === "blocked" ? "task_blocked" : "task_status_changed";
  const eventInsert = await adminSupabase.from("agent_events").insert({
    agent_id: agentId,
    event_type: eventType,
    project_id: projectId || null,
    job_id: jobId,
    payload: { task_id: taskId, title: taskTitle || "New task", status: taskStatus, outcome: result.status || null, message: result.summary, raw_result: result.raw },
  });
  if (eventInsert.error) console.error(`[Listener] Failed to insert completion event for task ${taskId}:`, eventInsert.error);

  if (projectId) {
    try {
      const [{ maybeAdvanceProjectAfterTaskDone }, { syncProjectState }] = await Promise.all([
        import(path.join(REPO_ROOT, 'src/lib/project-handoff.ts')),
        import(path.join(REPO_ROOT, 'src/lib/project-state.ts')),
      ]);
      if (taskStatus === 'done') {
        await syncProjectState(adminSupabase, projectId);
        const { data: projectRow } = await adminSupabase.from('projects').select('name').eq('id', projectId).maybeSingle();
        await maybeAdvanceProjectAfterTaskDone(adminSupabase, {
          projectId,
          completedTaskId: taskId,
          projectName: projectRow?.name || null,
        });
      } else {
        await syncProjectState(adminSupabase, projectId);
      }
    } catch (error) {
      console.error(`[Listener] Failed downstream project handoff after task ${taskId}:`, error?.message || error);
    }
  }
}

async function getTaskExecutionContext(adminSupabase, taskId) {
  if (!adminSupabase || !taskId) return null;

  const { data, error } = await adminSupabase
    .from("sprint_items")
    .select("id, title, task_type, task_metadata, review_required, review_status")
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    console.error(`[Listener] Failed to fetch task execution context for ${taskId}:`, error);
    return null;
  }

  return data || null;
}

async function markNotificationDelivered(adminSupabase, agentId, taskId) {
  if (!adminSupabase || !agentId || !taskId) return;

  try {
    const { error } = await adminSupabase.from("agent_notifications").update({ status: "delivered" }).eq("agent_id", agentId).eq("task_id", taskId).eq("status", "pending");
    if (error) {
      if (error.code === "PGRST205") return;
      console.error(`[Listener] Failed to mark notification delivered for task ${taskId}:`, error);
    }
  } catch (error) {
    const message = error?.message || String(error);
    if (String(message).includes("agent_notifications")) return;
    console.warn(`[Listener] agent_notifications update skipped for task ${taskId}:`, message);
  }
}

function ensureLockDir() {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
}

function acquireListenerLock(agentName) {
  ensureLockDir();
  const lockPath = path.join(LOCK_DIR, `${agentName}.lock`);
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, String(process.pid));
    return {
      lockPath,
      release() {
        try {
          fs.closeSync(fd);
        } catch {}
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      },
    };
  } catch (error) {
    if (error && error.code === "EEXIST") {
      const ownerPid = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, "utf8").trim() : "unknown";
      throw new Error(`Listener lock already held for ${agentName} (pid ${ownerPid || "unknown"})`);
    }
    throw error;
  }
}

async function heartbeatAgent(adminSupabase, agentId) {
  if (!adminSupabase || !agentId) return;
  const { error } = await adminSupabase.from("agents").update({ last_seen: new Date().toISOString() }).eq("id", agentId);
  if (error) console.error(`[Listener] Heartbeat update failed for agent ${agentId}:`, error);
}

async function fetchPendingTasks(adminSupabase, agentId) {
  if (!adminSupabase || !agentId) return [];
  const { data, error } = await adminSupabase.from("sprint_items").select("id, project_id, sprint_id, title, status, assignee_agent_id, created_at").eq("assignee_agent_id", agentId).eq("status", "todo").order("created_at", { ascending: true }).limit(25);
  if (error) {
    console.error(`[Listener] Failed to fetch pending tasks for agent ${agentId}:`, error);
    return [];
  }
  return data || [];
}

async function isRunnableTask(adminSupabase, task) {
  if (!adminSupabase || !task?.sprint_id) return true;
  const { data, error } = await adminSupabase.from("sprints").select("status").eq("id", task.sprint_id).maybeSingle();
  if (error) {
    console.error(`[Listener] Failed to inspect sprint ${task.sprint_id} for task ${task.id}:`, error);
    return false;
  }
  return (data?.status || "active") === "active";
}

async function reconcilePendingTasks(adminSupabase, realtimeSupabase, agentId, agentName, processedTasks, enqueueTask) {
  const pendingTasks = await fetchPendingTasks(adminSupabase, agentId);
  if (!pendingTasks.length) {
    console.log(`[Listener] No existing todo tasks to reconcile for ${agentName}`);
    return;
  }

  console.log(`[Listener] Reconciling ${pendingTasks.length} existing todo task(s) for ${agentName}`);
  for (const task of pendingTasks) {
    if (processedTasks.has(task.id)) continue;
    if (!(await isRunnableTask(adminSupabase, task))) {
      console.log(`[Listener] Skipping non-runnable future-sprint task ${task.id} for ${agentName}`);
      continue;
    }
    const claimed = await markTaskInProgress(adminSupabase, agentId, task.id, task.project_id, task.title);
    if (!claimed) continue;
    processedTasks.add(task.id);
    const project = await getProjectExecutionContext(adminSupabase || realtimeSupabase, task.project_id);
    await markNotificationDelivered(adminSupabase, agentId, task.id);
    enqueueTask(project, task.title, task.id, task.project_id);
  }
}

async function startListener() {
  loadEnv();
  const config = parseArgs();
  let agentId = config.agentId;
  let agentName = config.agentName;

  if (!agentId && !agentName) {
    console.error("[Listener] Error: Must specify either --agent-id or --agent-name");
    process.exit(1);
  }
  if (agentName && !agentId) {
    agentId = getAgentIdFromName(agentName);
    if (!agentId) {
      console.error(`[Listener] Error: Unknown agent name: ${agentName}`);
      process.exit(1);
    }
  }
  if (agentId && !agentName) {
    agentName = getAgentNameFromId(agentId);
    if (!agentName) {
      console.error(`[Listener] Error: Unknown agent ID: ${agentId}`);
      process.exit(1);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[Listener] Error: Missing Supabase credentials in environment");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, { realtime: { params: { eventsPerSecond: 10 } } });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminSupabase = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  if (!adminSupabase) console.warn("[Listener] SUPABASE_SERVICE_ROLE_KEY missing; task state writeback disabled");

  console.log(`[Listener] Starting agent listener for: ${agentName} (${agentId})`);
  console.log(`[Listener] Connecting to Supabase: ${supabaseUrl}`);

  const listenerLock = acquireListenerLock(agentName);
  const processedTasks = new Set();
  const queuedTasks = new Set();
  const taskQueue = [];
  let isProcessingQueue = false;

  async function drainTaskQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    try {
      while (taskQueue.length > 0) {
        const nextTask = taskQueue.shift();
        if (!nextTask) continue;

        try {
          const { project, taskTitle, taskId, projectId } = nextTask;
          console.log(`[Listener] Running queued task ${taskId} for ${agentName}`);
          const taskContext = await getTaskExecutionContext(adminSupabase, taskId);
          const message = buildAgentMessage({
            project,
            taskTitle,
            taskId,
            projectId,
            taskType: taskContext?.task_type || null,
            taskMetadata: taskContext?.task_metadata || null,
          });
          console.log(`[Listener] Triggering agent ${agentName} for task: ${taskTitle}`);
          console.log(`[Listener] Message: ${message}`);
          const result = await runAgentUntilStopCondition(agentName, message);
          console.log(`[Listener] Agent ${agentName} finished task ${taskId} with ${result.taskStatus}: ${result.summary}`);
          await finalizeTaskRun(adminSupabase, agentId, taskId, projectId, taskTitle, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[Listener] Failed to run agent for task ${nextTask.taskId}:`, message);
          await finalizeTaskRun(adminSupabase, agentId, nextTask.taskId, nextTask.projectId, nextTask.taskTitle, { status: "blocked", taskStatus: "blocked", summary: `Agent execution failed: ${message}`, raw: message });
        } finally {
          queuedTasks.delete(nextTask.taskId);
        }
      }
    } finally {
      isProcessingQueue = false;
    }
  }

  function enqueueOpenClawTask(project, taskTitle, taskId, projectId) {
    if (!taskId) return;
    if (queuedTasks.has(taskId)) {
      console.log(`[Listener] Task ${taskId} is already queued for ${agentName}, skipping duplicate enqueue`);
      return;
    }
    queuedTasks.add(taskId);
    taskQueue.push({ project, taskTitle, taskId, projectId });
    console.log(`[Listener] Enqueued task ${taskId} for ${agentName}. Queue length: ${taskQueue.length}`);
    void drainTaskQueue();
  }

  async function processTaskRecord(record, source) {
    if (!record?.id) return;
    if (record.status !== "todo") return;
    if (processedTasks.has(record.id)) {
      console.log(`[Listener] Task ${record.id} already processed, skipping ${source}`);
      return;
    }
    if (!(await isRunnableTask(adminSupabase, record))) {
      console.log(`[Listener] Ignoring ${source} for future-sprint task ${record.id}`);
      return;
    }

    const claimed = await markTaskInProgress(adminSupabase, agentId, record.id, record.project_id, record.title);
    if (!claimed) return;

    processedTasks.add(record.id);
    if (processedTasks.size > 100) {
      const iterator = processedTasks.values();
      for (let i = 0; i < 50; i++) processedTasks.delete(iterator.next().value);
    }
    const project = await getProjectExecutionContext(adminSupabase || supabase, record.project_id);
    await markNotificationDelivered(adminSupabase, agentId, record.id);
    enqueueOpenClawTask(project, record.title, record.id, record.project_id);
  }

  const channel = supabase.channel(`agent-listener-${agentId}`).on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "sprint_items",
    filter: `assignee_agent_id=eq.${agentId}`,
  }, async (payload) => {
    const record = payload.new;
    console.log(`[Listener] Task change detected (${payload.eventType}):`, record);
    await processTaskRecord(record, `postgres ${payload.eventType}`);
  }).subscribe((status, err) => {
    if (status === "SUBSCRIBED") console.log(`[Listener] Subscribed to sprint_items changes for agent ${agentName}`);
    if (err) console.error(`[Listener] Subscription error:`, err);
  });

  const broadcastChannel = supabase.channel(`agent-${agentId}`).on("broadcast", { event: "agent_work" }, (payload) => {
    console.log(`[Listener] Received broadcast:`, payload);
    const taskId = payload.payload?.taskId || payload.payload?.task_id;
    const projectName = payload.payload?.projectName || payload.payload?.project_name;
    const taskTitle = payload.payload?.taskTitle || payload.payload?.task_title;
    if (taskId && processedTasks.has(taskId)) {
      console.log(`[Listener] Task ${taskId} already processed via broadcast, skipping`);
      return;
    }
    console.log(`[Listener] Processing broadcast task: ${taskTitle}`);
    Promise.resolve(markTaskInProgress(adminSupabase, agentId, taskId, payload.payload?.project_id || null, taskTitle || "New task"))
      .then((claimed) => {
        if (!claimed) return;
        if (taskId) processedTasks.add(taskId);
        return getProjectExecutionContext(adminSupabase || supabase, payload.payload?.project_id || null)
          .then((project) => markNotificationDelivered(adminSupabase, agentId, taskId)
            .catch((error) => console.error(`[Listener] Pre-trigger delivery update failed for task ${taskId}:`, error))
            .finally(() => enqueueOpenClawTask(project?.id ? project : { name: projectName || "Unknown Project" }, taskTitle || "New task", taskId, payload.payload?.project_id || null)))
      })
      .catch((error) => console.error(`[Listener] Pre-trigger writeback failed for task ${taskId}:`, error));
  }).subscribe((status, err) => {
    if (status === "SUBSCRIBED") console.log(`[Listener] Subscribed to broadcast messages for agent ${agentName}`);
    if (err) console.error(`[Listener] Broadcast subscription error:`, err);
  });

  await reconcilePendingTasks(adminSupabase, supabase, agentId, agentName, processedTasks, enqueueOpenClawTask);
  const heartbeatInterval = setInterval(() => heartbeatAgent(adminSupabase, agentId).catch((error) => console.error(`[Listener] Heartbeat loop failed for agent ${agentName}:`, error)), HEARTBEAT_INTERVAL_MS);
  const reconcileInterval = setInterval(() => reconcilePendingTasks(adminSupabase, supabase, agentId, agentName, processedTasks, enqueueOpenClawTask).catch((error) => console.error(`[Listener] Reconcile loop failed for agent ${agentName}:`, error)), RECONCILE_INTERVAL_MS);
  await heartbeatAgent(adminSupabase, agentId);
  console.log(`[Listener] Listening for new tasks...`);

  const shutdown = () => {
    console.log("\n[Listener] Shutting down...");
    clearInterval(heartbeatInterval);
    clearInterval(reconcileInterval);
    supabase.removeChannel(channel);
    supabase.removeChannel(broadcastChannel);
    listenerLock.release();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startListener().catch((err) => {
  console.error("[Listener] Fatal error:", err);
  process.exit(1);
});
