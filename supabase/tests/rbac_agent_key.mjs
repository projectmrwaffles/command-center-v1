/**
 * RBAC Agent Key Test — Gate 1 (Model A)
 * Agents call Next.js API with X-Agent-Key. Never hit DB directly.
 * API verifies key → uses service_role for DB ops with explicit agent_id.
 *
 * Prerequisites: npm run start (server on localhost:3000)
 * Seeds agent rows + api_key_hash via service_role before tests.
 *
 * Usage: node supabase/tests/rbac_agent_key.mjs
 */

import { createClient } from '@supabase/supabase-js';

const API = 'http://localhost:3000';
const URL = 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIxOTUzNiwiZXhwIjoyMDg3Nzk1NTM2fQ.7AeC5aTtgzPhDoKNNv-8LERzWJKdf7L-x4bLJITF6z8';

const AGENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const KEY_A = 'test-key-agent-a-secret';
const KEY_B = 'test-key-agent-b-secret';
const PROJ = '11111111-1111-1111-1111-111111111111';
const JOB_A = 'eeee0001-0001-0001-0001-000000000001';
const JOB_B = 'eeee0002-0002-0002-0002-000000000002';

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

let ok = 0, nok = 0;
const r = (n, p, d) => {
  const msg = d ? ` — ${d}` : '';
  if (p) {
    console.log(`[PASS] ${n}${msg}`);
    ok = ok + 1;
  } else {
    console.log(`[FAIL] ${n}${msg}`);
    nok = nok + 1;
  }
};

async function api(method, path, key, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-agent-key': key },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json };
}

async function main() {
  console.log('=== RBAC AGENT KEY TEST (Model A — API only) ===\n');

  // -- seed --
  console.log('--- Seed ---');
  await svc.from('agent_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('ai_usage').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('approvals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('artifacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('agents').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  await svc.from('agents').insert([
    { id: AGENT_A, name: 'AgentA', type: 'primary', status: 'active', api_key_hash: KEY_A, last_seen: new Date().toISOString() },
    { id: AGENT_B, name: 'AgentB', type: 'sub', status: 'active', api_key_hash: KEY_B, last_seen: new Date().toISOString() },
  ]);
  await svc.from('projects').insert({ id: PROJ, name: 'Test', project_type: 'eng', status: 'active' });
  await svc.from('jobs').insert([
    { id: JOB_A, project_id: PROJ, title: 'Job A', status: 'in_progress', owner_agent_id: AGENT_A },
    { id: JOB_B, project_id: PROJ, title: 'Job B', status: 'queued', owner_agent_id: AGENT_B },
  ]);
  console.log('Seed done.\n');

  // -- T1: No key → 401 --
  console.log('--- T1: No key → 401 ---');
  const t1 = await api('GET', '/api/agent/agents', '', null);
  r('no key rejected', t1.status === 401, `status=${t1.status}`);

  // -- T2: Agent A reads own agent via API → 200, 1 row --
  console.log('\n--- T2: Agent A reads own agent ---');
  const t2 = await api('GET', '/api/agent/agents', KEY_A, null);
  const t2ok = t2.status === 200 && Array.isArray(t2.data) && t2.data.length === 1 && t2.data[0].id === AGENT_A;
  r('A reads own agent', t2ok, `status=${t2.status} rows=${t2.data?.length} id=${t2.data?.[0]?.id}`);

  // -- T3: Agent A cannot read Agent B via API → only own data returned --
  console.log('\n--- T3: Agent A cannot read Agent B ---');
  const t3names = (t2.data || []).map(a => a.name);
  const t3ok = !t3names.includes('AgentB');
  r('A cannot see B', t3ok, `names=${JSON.stringify(t3names)}`);

  // -- T4: Agent A inserts own event via API → 201 --
  console.log('\n--- T4: Agent A inserts own event ---');
  const t4 = await api('POST', '/api/agent/events', KEY_A, {
    agent_id: AGENT_A, event_type: 'HEARTBEAT', payload: { test: true }
  });
  r('A inserts own event', t4.status === 201, `status=${t4.status}`);

  // -- T5: Agent A cannot insert event for B → 403 --
  console.log('\n--- T5: Agent A inserts event for B (expect 403) ---');
  const t5 = await api('POST', '/api/agent/events', KEY_A, {
    agent_id: AGENT_B, event_type: 'HEARTBEAT', payload: { hack: true }
  });
  r('A insert for B blocked', t5.status === 403, `status=${t5.status} body=${JSON.stringify(t5.data)}`);

  // -- T6: Agent A inserts own ai_usage → 201 --
  console.log('\n--- T6: Agent A inserts own usage ---');
  const t6 = await api('POST', '/api/agent/usage', KEY_A, {
    agent_id: AGENT_A, provider: 'openai', model: 'gpt-4', tokens_in: 100, tokens_out: 50, total_tokens: 150
  });
  r('A inserts own usage', t6.status === 201, `status=${t6.status}`);

  // -- T7: Agent A cannot insert usage for B → 403 --
  console.log('\n--- T7: Agent A inserts usage for B (expect 403) ---');
  const t7 = await api('POST', '/api/agent/usage', KEY_A, {
    agent_id: AGENT_B, provider: 'openai', model: 'gpt-4', tokens_in: 100, tokens_out: 50, total_tokens: 150
  });
  r('A usage for B blocked', t7.status === 403, `status=${t7.status}`);

  // -- T8: Agent A updates own job (allowed field: status) → 200 --
  console.log('\n--- T8: Agent A updates own job (status) ---');
  const t8 = await api('PATCH', `/api/agent/jobs/${JOB_A}`, KEY_A, { status: 'completed' });
  r('A updates own job', t8.status === 200, `status=${t8.status}`);

  // -- T9: Agent A updates own job (forbidden field: title) → 403 --
  console.log('\n--- T9: Agent A updates forbidden field (expect 403) ---');
  const t9 = await api('PATCH', `/api/agent/jobs/${JOB_A}`, KEY_A, { title: 'hacked' });
  r('A forbidden field blocked', t9.status === 403, `status=${t9.status} body=${JSON.stringify(t9.data)}`);

  // -- T10: Agent A updates B's job → 403 --
  console.log('\n--- T10: Agent A updates B job (expect 403) ---');
  const t10 = await api('PATCH', `/api/agent/jobs/${JOB_B}`, KEY_A, { status: 'completed' });
  r('A update B job blocked', t10.status === 403, `status=${t10.status}`);

  // -- summary --
  console.log(`\n=== SUMMARY: ${ok} PASSED, ${nok} FAILED ===`);
  console.log(nok === 0 ? '\nAGENT KEY VERDICT: PASS' : '\nAGENT KEY VERDICT: FAIL');
  process.exit(nok > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
