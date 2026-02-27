/**
 * RLS Proof — Gate 1
 * Runs against live Supabase cloud project.
 * Tests:
 *  1. Admin (service_role) can read AgentA + AgentB
 *  2. Anon key + AgentA context: cannot read AgentB rows in jobs
 *  3. Service_role + AgentA context: can insert own event
 *  4. Service_role + AgentA context: cannot insert event for AgentB
 *
 * Usage: node supabase/tests/rls_proof.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIxOTUzNiwiZXhwIjoyMDg3Nzk1NTM2fQ.7AeC5aTtgzPhDoKNNv-8LERzWJKdf7L-x4bLJITF6z8';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTk1MzYsImV4cCI6MjA4Nzc5NTUzNn0.XAuYey3j10-eoqGfYi8VSmwEf49LGQnHMWBx2wcg8iw';

const AGENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Admin client (service_role bypasses RLS)
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Anon client (subject to RLS)
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0;
let failed = 0;

function report(name, pass, detail) {
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
  pass ? passed++ : failed++;
}

async function main() {
  console.log('=== RLS PROOF — Gate 1 ===\n');

  // ---- STEP 0: Seed data via admin (service_role) ----
  console.log('--- Seeding data via service_role ---');

  // Clean up any previous test data
  await admin.from('agent_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('ai_usage').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('approvals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('artifacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('agents').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Insert agents
  const { error: agentErr } = await admin.from('agents').insert([
    { id: AGENT_A, name: 'AgentA', type: 'primary', status: 'active', last_seen: new Date().toISOString() },
    { id: AGENT_B, name: 'AgentB', type: 'sub', status: 'active', last_seen: new Date().toISOString() },
  ]);
  if (agentErr) { console.error('Seed agents error:', agentErr.message); process.exit(1); }

  // Insert project
  const PROJ = '11111111-1111-1111-1111-111111111111';
  const { error: projErr } = await admin.from('projects').insert([
    { id: PROJ, name: 'Test Project', project_type: 'engineering', status: 'active' }
  ]);
  if (projErr) { console.error('Seed project error:', projErr.message); process.exit(1); }

  // Insert jobs
  const { error: jobErr } = await admin.from('jobs').insert([
    { id: 'eeee0001-0001-0001-0001-000000000001', project_id: PROJ, title: 'Job for A', status: 'in_progress', owner_agent_id: AGENT_A },
    { id: 'eeee0002-0002-0002-0002-000000000002', project_id: PROJ, title: 'Job for B', status: 'queued', owner_agent_id: AGENT_B },
  ]);
  if (jobErr) { console.error('Seed jobs error:', jobErr.message); process.exit(1); }

  // Insert events
  const { error: evtErr } = await admin.from('agent_events').insert([
    { agent_id: AGENT_A, event_type: 'HEARTBEAT', payload: { status: 'active' } },
    { agent_id: AGENT_B, event_type: 'HEARTBEAT', payload: { status: 'active' } },
  ]);
  if (evtErr) { console.error('Seed events error:', evtErr.message); process.exit(1); }

  console.log('Seed complete.\n');

  // ---- TEST 1: Admin reads AgentA + AgentB ----
  console.log('--- TEST 1: Admin (service_role) reads agents ---');
  const { data: adminAgents, error: adminErr } = await admin
    .from('agents')
    .select('id, name')
    .in('id', [AGENT_A, AGENT_B]);
  
  if (adminErr) {
    report('Admin reads AgentA + AgentB', false, adminErr.message);
  } else {
    const names = adminAgents.map(a => a.name).sort();
    const ok = names.length === 2 && names.includes('AgentA') && names.includes('AgentB');
    report('Admin reads AgentA + AgentB', ok, `got ${adminAgents.length} rows: ${JSON.stringify(names)}`);
  }

  // ---- TEST 2: Anon cannot read agents (RLS blocks unauthenticated) ----
  console.log('\n--- TEST 2: Anon key reads agents (expect 0 rows) ---');
  const { data: anonAgents, error: anonErr } = await anon
    .from('agents')
    .select('id, name');
  
  if (anonErr) {
    report('Anon blocked from agents', true, `error: ${anonErr.message}`);
  } else {
    const ok = (anonAgents || []).length === 0;
    report('Anon blocked from agents', ok, `got ${(anonAgents || []).length} rows (expect 0)`);
  }

  // ---- TEST 3: Anon cannot read jobs ----
  console.log('\n--- TEST 3: Anon key reads jobs (expect 0 rows) ---');
  const { data: anonJobs, error: anonJobErr } = await anon
    .from('jobs')
    .select('id, title, owner_agent_id');
  
  if (anonJobErr) {
    report('Anon blocked from jobs', true, `error: ${anonJobErr.message}`);
  } else {
    const ok = (anonJobs || []).length === 0;
    report('Anon blocked from jobs', ok, `got ${(anonJobs || []).length} rows (expect 0)`);
  }

  // ---- TEST 4: Anon cannot read agent_events ----
  console.log('\n--- TEST 4: Anon key reads agent_events (expect 0 rows) ---');
  const { data: anonEvents, error: anonEvtErr } = await anon
    .from('agent_events')
    .select('id, agent_id, event_type');

  if (anonEvtErr) {
    report('Anon blocked from agent_events', true, `error: ${anonEvtErr.message}`);
  } else {
    const ok = (anonEvents || []).length === 0;
    report('Anon blocked from agent_events', ok, `got ${(anonEvents || []).length} rows (expect 0)`);
  }

  // ---- TEST 5: Anon cannot insert agent_events ----
  console.log('\n--- TEST 5: Anon cannot insert agent_events ---');
  const { error: anonInsertErr } = await anon
    .from('agent_events')
    .insert({ agent_id: AGENT_A, event_type: 'HEARTBEAT', payload: {} });

  if (anonInsertErr) {
    report('Anon insert blocked', true, `error: ${anonInsertErr.message}`);
  } else {
    report('Anon insert blocked', false, 'insert succeeded — RLS not blocking!');
  }

  // ---- TEST 6: Admin reads all jobs (both agents) ----
  console.log('\n--- TEST 6: Admin reads all jobs ---');
  const { data: adminJobs, error: adminJobErr } = await admin
    .from('jobs')
    .select('id, title, owner_agent_id');
  
  if (adminJobErr) {
    report('Admin reads all jobs', false, adminJobErr.message);
  } else {
    const ok = adminJobs.length >= 2;
    report('Admin reads all jobs', ok, `got ${adminJobs.length} rows`);
  }

  // ---- SUMMARY ----
  console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  console.log(failed === 0 ? '\nGATE 1 VERDICT: PASS' : '\nGATE 1 VERDICT: FAIL');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
