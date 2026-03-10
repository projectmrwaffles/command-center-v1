#!/usr/bin/env node
/**
 * Project Agent Trigger
 * Run this script to check for new projects and trigger agents to start working
 * 
 * Usage: node scripts/trigger-agents.js
 * Or run continuously: node scripts/trigger-agents.js --watch
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIxOTUzNiwiZXhwIjoyMDg3Nzk1NTM2fQ.7AeC5aTtgzPhDoKNNv-8LERzWJKdf7L-x4bLJITF6z8';

// Map DB agent IDs to OpenClaw agent names
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

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

async function triggerAgent(agentId, projectName, taskTitle) {
  const agentName = AGENT_MAP[agentId];
  if (!agentName) {
    console.log(`Unknown agent ID: ${agentId}`);
    return;
  }
  
  const message = `New task for project "${projectName}": ${taskTitle}. Start working on this.`;
  
  try {
    console.log(`Triggering ${agentName} for: ${taskTitle}`);
    // Run in background with nohup to avoid blocking
    execSync(`nohup openclaw agent --agent ${agentName} --message '${message.replace(/'/g, "'")}' --timeout 30 > /tmp/agent-${agentName}.log 2>&1 &`, {
      encoding: 'utf8',
      stdio: 'ignore'
    });
    console.log(`✓ Triggered ${agentName} (background)`);
  } catch (e) {
    console.error(`Failed to trigger ${agentName}:`, e.message);
  }
}

async function processNewProjects() {
  console.log(`\n[${new Date().toISOString()}] Checking for new projects...`);
  
  // Get active projects created in the last hour that haven't been processed
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: projects } = await db
    .from('projects')
    .select('id, name, created_at')
    .eq('status', 'active')
    .gte('created_at', oneHourAgo);
  
  if (!projects || projects.length === 0) {
    console.log('No new projects found');
    return;
  }
  
  for (const project of projects) {
    console.log(`\nProcessing project: ${project.name}`);
    
    // Get tasks for this project that haven't been started
    const { data: tasks } = await db
      .from('sprint_items')
      .select('id, title, assignee_agent_id, status')
      .eq('project_id', project.id)
      .eq('status', 'todo');
    
    if (!tasks || tasks.length === 0) {
      console.log('No pending tasks');
      continue;
    }
    
    // Trigger each task's assignee
    for (const task of tasks) {
      if (task.assignee_agent_id) {
        await triggerAgent(task.assignee_agent_id, project.name, task.title);
        
        // Update task status to in_progress
        await db
          .from('sprint_items')
          .update({ status: 'in_progress' })
          .eq('id', task.id);
        
        // Log event
        await db.from('agent_events').insert({
          agent_id: task.assignee_agent_id,
          project_id: project.id,
          event_type: 'task_started',
          payload: { task_id: task.id, title: task.title }
        });
      }
    }
  }
}

async function main() {
  const watch = process.argv.includes('--watch');
  
  console.log('Project Agent Trigger');
  console.log('=====================');
  
  if (watch) {
    console.log('Running in watch mode (every 30 seconds)...');
    setInterval(processNewProjects, 30000);
  } else {
    await processNewProjects();
  }
}

main().catch(console.error);
