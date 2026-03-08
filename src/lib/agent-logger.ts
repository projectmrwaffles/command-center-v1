/**
 * Agent Activity Logger for Command Center
 * This module provides functions to log agent activity to the database
 * Used by OpenClaw agents to track their work in Command Center
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OPENCLAW_SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.warn('[Agent Logger] No Supabase key configured - activity will not be logged');
}

const supabase = SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

/**
 * Log agent status change
 */
export async function logAgentStatus(agentId: string, status: 'active' | 'idle' | 'offline', jobId?: string) {
  if (!supabase) {
    console.log('[Agent Logger] Would log status:', { agentId, status, jobId });
    return;
  }
  
  const { error } = await supabase
    .from('agents')
    .update({ 
      status, 
      last_seen: new Date().toISOString(),
      current_job_id: jobId || null
    })
    .eq('id', agentId);
  
  if (error) {
    console.error('[Agent Logger] Failed to update agent status:', error);
  }
}

/**
 * Log AI usage from agent work
 */
export async function logUsage(agentId: string, data: {
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  projectId?: string;
  jobId?: string;
}) {
  if (!supabase) {
    console.log('[Agent Logger] Would log usage:', data);
    return;
  }
  
  const { error } = await supabase
    .from('ai_usage')
    .insert({
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
  
  if (error) {
    console.error('[Agent Logger] Failed to log usage:', error);
  }
}

/**
 * Log an event (task completed, started, etc.)
 */
export async function logEvent(agentId: string, eventType: string, data: {
  projectId?: string;
  jobId?: string;
  sprintId?: string;
  description?: string;
}) {
  if (!supabase) {
    console.log('[Agent Logger] Would log event:', { eventType, ...data });
    return;
  }
  
  const { error } = await supabase
    .from('agent_events')
    .insert({
      agent_id: agentId,
      event_type: eventType,
      project_id: data.projectId,
      job_id: data.jobId,
      payload: data.description ? { description: data.description } : null,
    });
  
  if (error) {
    console.error('[Agent Logger] Failed to log event:', error);
  }
}

/**
 * Update task status
 */
export async function updateTaskStatus(taskId: string, status: 'todo' | 'in_progress' | 'blocked' | 'done') {
  if (!supabase) {
    console.log('[Agent Logger] Would update task:', { taskId, status });
    return;
  }
  
  const { error } = await supabase
    .from('sprint_items')
    .update({ status })
    .eq('id', taskId);
  
  if (error) {
    console.error('[Agent Logger] Failed to update task:', error);
  }
}

/**
 * Create a job (work item)
 */
export async function createJob(agentId: string, data: {
  title: string;
  projectId: string;
  status?: 'pending' | 'active' | 'completed' | 'blocked';
}) {
  if (!supabase) {
    console.log('[Agent Logger] Would create job:', data);
    return null;
  }
  
  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      owner_agent_id: agentId,
      title: data.title,
      project_id: data.projectId,
      status: data.status || 'pending',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Agent Logger] Failed to create job:', error);
    return null;
  }
  
  return job;
}

// CLI interface for direct calling
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'status': {
      const [, agentId, status, jobId] = args;
      logAgentStatus(agentId, status as 'active' | 'idle' | 'offline', jobId).then(() => process.exit(0));
      break;
    }
    case 'usage': {
      const [, agentId, model, provider, tokensIn, tokensOut, cost, projectId, jobId] = args;
      logUsage(agentId, { 
        model, provider, 
        tokensIn: parseInt(tokensIn), 
        tokensOut: parseInt(tokensOut), 
        costUsd: parseFloat(cost),
        projectId,
        jobId
      }).then(() => process.exit(0));
      break;
    }
    case 'event': {
      const [, agentId, eventType, projectId, jobId, description] = args;
      logEvent(agentId, eventType, { projectId, jobId, description }).then(() => process.exit(0));
      break;
    }
    default:
      console.log('Usage:');
      console.log('  node agent-logger.js status <agentId> <status> [jobId]');
      console.log('  node agent-logger.js usage <agentId> <model> <provider> <tokensIn> <tokensOut> <cost> [projectId] [jobId]');
      console.log('  node agent-logger.js event <agentId> <eventType> [projectId] [jobId] [description]');
  }
}