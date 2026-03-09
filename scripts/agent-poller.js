#!/usr/bin/env node
/**
 * Agent Activity Poller for Command Center
 * Runs continuously to log OpenClaw agent activity to the database
 */

const { execSync } = require('child_process');

// Configuration
const SUPABASE_URL = 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const AUTH_TOKEN = 'agent-log-123';
const POLL_INTERVAL = 60000; // 1 minute

// Track previous token counts to calculate delta
const previousTokens = new Map();

// Agent name to ID mapping
const AGENT_MAP = {
  'main': '11111111-1111-1111-1111-000000000001',
  'product-lead': '11111111-1111-1111-1111-000000000002',
  'head-of-design': '11111111-1111-1111-1111-000000000003',
  'product-designer-app': '11111111-1111-1111-1111-000000000004',
  'web-designer-marketing': '11111111-1111-1111-1111-000000000005',
  'tech-lead-architect': '11111111-1111-1111-1111-000000000006',
  'frontend-engineer': '11111111-1111-1111-1111-000000000007',
  'backend-engineer': '11111111-1111-1111-1111-000000000008',
  'mobile-engineer': '11111111-1111-1111-1111-000000000009',
  'seo-web-developer': '11111111-1111-1111-1111-000000000010',
  'growth-lead': '11111111-1111-1111-1111-000000000011',
  'marketing-producer': '11111111-1111-1111-1111-000000000012',
  'marketing-ops-analytics': '11111111-1111-1111-1111-000000000013',
  'qa-auditor': '11111111-1111-1111-1111-000000000014',
};

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function pollAgents() {
  try {
    // Get active sessions from OpenClaw
    const output = execSync('openclaw sessions --active 15 --all-agents --json', { encoding: 'utf8' });
    const data = JSON.parse(output);
    
    if (!data.sessions || data.sessions.length === 0) {
      log('No active sessions');
      return;
    }
    
    for (const session of data.sessions) {
      const agentName = session.agentId || 'main';
      const agentId = AGENT_MAP[agentName];
      
      if (!agentId) {
        log(`Unknown agent: ${agentName}`);
        continue;
      }
      
      const ageMs = session.ageMs || 0;
      const status = ageMs < 300000 ? 'active' : 'idle';
      
      // Log status
      await fetch('http://localhost:3000/api/agent/log', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'status',
          data: { agent_id: agentId, status }
        })
      });
      
      // Log usage delta (new tokens since last check)
      if (session.totalTokensFresh && session.totalTokens > 0) {
        const prev = previousTokens.get(agentName) || { input: 0, output: 0, total: 0 };
        const currInput = session.inputTokens || 0;
        const currOutput = session.outputTokens || 0;
        const currTotal = session.totalTokens || 0;
        
        // Calculate delta (new tokens used)
        const deltaInput = Math.max(0, currInput - prev.input);
        const deltaOutput = Math.max(0, currOutput - prev.output);
        const deltaTotal = deltaInput + deltaOutput;
        
        // Only log if there's actual new usage
        if (deltaTotal > 0) {
          const cost = deltaTotal * 0.000001; // Rough estimate per 1M tokens
          
          await fetch('http://localhost:3000/api/agent/log', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${AUTH_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'usage',
              data: {
                agent_id: agentId,
                model: session.model || 'minimax/minimax-m2.5',
                provider: session.modelProvider || 'openrouter',
                tokens_in: deltaInput,
                tokens_out: deltaOutput,
                cost_usd: cost
              }
            })
          });
          
          log(`Logged usage for ${agentName}: +${deltaTotal} tokens`);
        }
        
        // Update previous counts
        previousTokens.set(agentName, { input: currInput, output: currOutput, total: currTotal });
      }
      
      log(`Logged ${agentName}: ${status}`);
    }
  } catch (error) {
    log(`Error: ${error.message}`);
  }
}

async function main() {
  log('Agent poller started');
  
  // Initial poll
  await pollAgents();
  
  // Poll every minute
  setInterval(pollAgents, POLL_INTERVAL);
}

main();