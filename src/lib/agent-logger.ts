/**
 * Agent Activity Logger for Command Center
 * Requires explicit environment configuration; no baked-in project secrets.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[Agent Logger] Supabase env not configured - activity will not be logged');
}

const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export async function logAgentStatus(agentId: string, status: 'active' | 'idle' | 'offline', jobId?: string) {
  if (!supabase) return;
  const { error } = await supabase.from('agents').update({ status, last_seen: new Date().toISOString(), current_job_id: jobId || null }).eq('id', agentId);
  if (error) console.error('[Agent Logger] Failed to update agent status:', error);
}

export async function logUsage(agentId: string, data: { model: string; provider: string; tokensIn: number; tokensOut: number; costUsd: number; projectId?: string; jobId?: string; }) {
  if (!supabase) return;
  const { error } = await supabase.from('ai_usage').insert({
    agent_id: agentId,
    model: data.model,
    provider: data.provider,
    tokens_in: data.tokensIn,
    tokens_out: data.tokensOut,
    total_tokens: data.tokensIn + data.tokensOut,
    cost_usd: data.costUsd,
    project_id: data.projectId,
    job_id: data.jobId,
  });
  if (error) console.error('[Agent Logger] Failed to log usage:', error);
}

export async function logEvent(agentId: string, eventType: string, data: { projectId?: string; jobId?: string; sprintId?: string; description?: string; }) {
  if (!supabase) return;
  const { error } = await supabase.from('agent_events').insert({
    agent_id: agentId,
    event_type: eventType,
    project_id: data.projectId,
    job_id: data.jobId,
    payload: data.description ? { description: data.description } : null,
  });
  if (error) console.error('[Agent Logger] Failed to log event:', error);
}

export async function updateTaskStatus(taskId: string, status: 'todo' | 'in_progress' | 'blocked' | 'done') {
  if (!supabase) return;
  const { error } = await supabase.from('sprint_items').update({ status }).eq('id', taskId);
  if (error) console.error('[Agent Logger] Failed to update task:', error);
}

export async function createJob(agentId: string, data: { title: string; projectId: string; status?: 'pending' | 'active' | 'completed' | 'blocked'; }) {
  if (!supabase) return null;
  const { data: job, error } = await supabase.from('jobs').insert({ owner_agent_id: agentId, title: data.title, project_id: data.projectId, status: data.status || 'pending' }).select().single();
  if (error) {
    console.error('[Agent Logger] Failed to create job:', error);
    return null;
  }
  return job;
}
