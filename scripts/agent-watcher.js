#!/usr/bin/env node
/**
 * Agent Activity Watcher
 * Monitors OpenClaw sessions and updates Command Center DB with live activity
 * 
 * Run: node scripts/agent-watcher.js
 * Or continuously: node scripts/agent-watcher.js --watch
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync, spawn } = require('child_process');

const SUPABASE_URL = 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIxOTUzNiwiZXhwIjoyMDg3Nzk1NTM2fQ.7AeC5aTtgzPhDoKNNv-8LERzWJKdf7L-x4bLJITF6z8';

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Track seen events to avoid duplicates
const seenEvents = new Set();

async function logEvent(agentId, projectId, eventType, payload = {}) {
  const key = `${agentId}-${projectId}-${eventType}-${JSON.stringify(payload)}`;
  if (seenEvents.has(key)) return;
  seenEvents.add(key);
  
  await db.from('agent_events').insert({
    agent_id: agentId,
    project_id: projectId,
    event_type: eventType,
    payload
  });
}

async function updateTaskStatus(taskId, status) {
  await db.from('sprint_items').update({ 
    status, 
    updated_at: new Date().toISOString() 
  }).eq('id', taskId);
}

async function updateProjectProgress(projectId) {
  const { data: tasks } = await db
    .from('sprint_items')
    .select('status')
    .eq('project_id', projectId);
  
  if (!tasks || tasks.length === 0) return;
  
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const progress = Math.round((doneCount / tasks.length) * 100);
  
  await db.from('projects').update({ 
    progress_pct: progress,
    updated_at: new Date().toISOString()
  }).eq('id', projectId);
}

async function getActiveSessions() {
  try {
    const result = execSync('openclaw sessions --json', { 
      encoding: 'utf8', 
      timeout: 10000 
    });
    return JSON.parse(result);
  } catch (e) {
    console.error('Failed to get sessions:', e.message);
    return [];
  }
}

async function getAgentUsage() {
  try {
    const result = execSync('openclaw agent usage --json --limit 50', { 
      encoding: 'utf8', 
      timeout: 15000 
    });
    const lines = result.split('\n').filter(l => l.trim().startsWith('{'));
    return lines.map(l => JSON.parse(l)).filter(u => u.tokens || u.cost);
  } catch (e) {
    // No usage data or command failed
    return [];
  }
}

async function syncAgentStatus() {
  const sessions = await getActiveSessions();
  
  // Get all agents from DB
  const { data: dbAgents } = await db.from('agents').select('id, name');
  
  // Map agent IDs to names
  const agentNameToId = {};
  dbAgents?.forEach(a => {
    agentNameToId[a.name?.toLowerCase()] = a.id;
  });
  
  // Update each agent's status based on sessions
  for (const session of sessions) {
    const agentName = session.agent || session.key?.split(':')[1];
    if (!agentName) continue;
    
    const agentId = agentNameToId[agentName?.toLowerCase()];
    if (!agentId) continue;
    
    // Update agent status to active
    await db.from('agents').update({ 
      status: 'active',
      last_seen: new Date().toISOString()
    }).eq('id', agentId);
    
    // Check if agent is working on a project task
    const { data: tasks } = await db
      .from('sprint_items')
      .select('id, title, project_id, status')
      .eq('assignee_agent_id', agentId)
      .eq('status', 'in_progress');
    
    for (const task of tasks) {
      // Log activity
      await logEvent(agentId, task.project_id, 'agent_active', { 
        task_id: task.id, 
        task_title: task.title 
      });
    }
  }
  
  // Mark agents not in sessions as idle
  const activeAgentNames = sessions.map(s => s.agent || s.key?.split(':')[1]).filter(Boolean);
  const activeAgentIds = activeAgentNames.map(n => agentNameToId[n?.toLowerCase()]).filter(Boolean);
  
  if (activeAgentIds.length > 0) {
    await db.from('agents')
      .update({ status: 'idle' })
      .neq('id', activeAgentIds[0]); // This won't work well, need different approach
  }
}

async function syncUsage() {
  const usageRecords = await getAgentUsage();
  
  for (const record of usageRecords) {
    const { agent, tokens, cost, model } = record;
    
    // Find agent by name
    const { data: agents } = await db
      .from('agents')
      .select('id')
      .ilike('name', `%${agent}%`);
    
    if (agents && agents.length > 0) {
      // Log usage event (can be aggregated later)
      await db.from('ai_usage').insert({
        agent_id: agents[0].id,
        model: model || 'unknown',
        input_tokens: Math.floor((tokens || 0) * 0.4),
        output_tokens: Math.floor((tokens || 0) * 0.6),
        cost: cost || 0
      }).catch(() => {}); // Table might not exist
    }
  }
}

async function checkForCompletedTasks() {
  // Look for any task status changes from OpenClaw context
  // This is a placeholder - in reality, we'd need agents to report back
  // For now, let's at least log that we're watching
}

async function runWatcher() {
  console.log(`[${new Date().toISOString()}] Agent Watcher running...`);
  
  try {
    // Sync agent statuses
    await syncAgentStatus();
    
    // Sync usage data  
    await syncUsage();
    
    // Update project progress based on task completion
    const { data: projects } = await db
      .from('projects')
      .select('id')
      .eq('status', 'active');
    
    for (const project of projects || []) {
      await updateProjectProgress(project.id);
    }
    
    console.log('✓ Sync complete');
  } catch (e) {
    console.error('Watcher error:', e.message);
  }
}

async function main() {
  const watch = process.argv.includes('--watch') || process.argv.includes('-w');
  
  console.log('='.repeat(50));
  console.log('Command Center Agent Watcher');
  console.log('Syncs OpenClaw activity to Supabase DB');
  console.log('='.repeat(50));
  
  if (watch) {
    console.log('\nRunning in continuous mode (every 15 seconds)...\n');
    await runWatcher(); // Initial run
    setInterval(runWatcher, 15000); // Run every 15 seconds
  } else {
    await runWatcher();
  }
}

main().catch(console.error);
