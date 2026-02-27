/**
 * RBAC Admin JWT Test — Gate 1
 * Creates a real admin user via Admin API (service_role),
 * signs in with password to get a real authenticated JWT,
 * then runs all RBAC tests using ONLY that JWT.
 *
 * Usage: node supabase/tests/rbac_admin_jwt.mjs
 */

import { createClient } from '@supabase/supabase-js';

const URL = 'https://yhyxxjeiogvgdsfvdkfx.supabase.co';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjIxOTUzNiwiZXhwIjoyMDg3Nzk1NTM2fQ.7AeC5aTtgzPhDoKNNv-8LERzWJKdf7L-x4bLJITF6z8';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloeXh4amVpb2d2Z2RzZnZka2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTk1MzYsImV4cCI6MjA4Nzc5NTUzNn0.XAuYey3j10-eoqGfYi8VSmwEf49LGQnHMWBx2wcg8iw';

const AGENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROJ    = '11111111-1111-1111-1111-111111111111';
const JOB_A   = 'eeee0001-0001-0001-0001-000000000001';
const JOB_B   = 'eeee0002-0002-0002-0002-000000000002';
const APPR    = 'ffff0001-0001-0001-0001-000000000001';

const EMAIL = `admin-gate1-${Date.now()}@cc.test`;
const PASS  = 'G8t3_1_Pr00f!';

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

let ok = 0, nok = 0;
const r = (n, p, d) => { console.log(`[${p?'PASS':'FAIL'}] ${n}${d?' — '+d:''}`); p ? ok++ : nok++; };

async function main() {
  console.log('=== RBAC ADMIN JWT TEST ===\n');

  // -- seed --
  console.log('--- Seed ---');
  await svc.from('agent_events').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await svc.from('ai_usage').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await svc.from('approvals').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await svc.from('artifacts').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await svc.from('jobs').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await svc.from('projects').delete().neq('id','00000000-0000-0000-0000-000000000000');
  await svc.from('agents').delete().neq('id','00000000-0000-0000-0000-000000000000');

  await svc.from('agents').insert([
    { id: AGENT_A, name:'AgentA', type:'primary', status:'active', last_seen: new Date().toISOString() },
    { id: AGENT_B, name:'AgentB', type:'sub',     status:'active', last_seen: new Date().toISOString() },
  ]);
  await svc.from('projects').insert({ id: PROJ, name:'Test', project_type:'eng', status:'active' });
  await svc.from('jobs').insert([
    { id: JOB_A, project_id: PROJ, title:'Job A', status:'in_progress',      owner_agent_id: AGENT_A },
    { id: JOB_B, project_id: PROJ, title:'Job B', status:'waiting_approval', owner_agent_id: AGENT_B },
  ]);
  await svc.from('approvals').insert({ id: APPR, job_id: JOB_B, agent_id: AGENT_B, status:'pending', summary:'Review' });
  console.log('Seed done.\n');

  // -- create real user --
  console.log('--- Create admin user ---');
  const { data: cu, error: cue } = await svc.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
  });
  if (cue) { console.error('createUser failed:', cue.message); process.exit(1); }
  const uid = cu.user.id;
  console.log(`User created: ${EMAIL} (${uid})\n`);

  // -- sign in to get real JWT --
  console.log('--- Sign in ---');
  const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: si, error: sie } = await authClient.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (sie) { console.error('signIn failed:', sie.message); process.exit(1); }
  const jwt = si.session.access_token;
  console.log(`JWT obtained. Prefix: ${jwt.substring(0,30)}...\n`);

  // -- build client with real JWT --
  const ac = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // TEST 1: read all agents
  console.log('--- T1: Admin JWT reads all agents ---');
  const { data: ag, error: age } = await ac.from('agents').select('id,name');
  age ? r('read agents', false, age.message) : r('read agents', ag.length >= 2, `${ag.length} rows`);

  // TEST 2: read all projects
  console.log('\n--- T2: Admin JWT reads all projects ---');
  const { data: pr, error: pre } = await ac.from('projects').select('id,name');
  pre ? r('read projects', false, pre.message) : r('read projects', pr.length >= 1, `${pr.length} rows`);

  // TEST 3: read all jobs
  console.log('\n--- T3: Admin JWT reads all jobs ---');
  const { data: jb, error: jbe } = await ac.from('jobs').select('id,title,owner_agent_id');
  jbe ? r('read jobs', false, jbe.message) : r('read jobs', jb.length >= 2, `${jb.length} rows`);

  // TEST 4: read all approvals
  console.log('\n--- T4: Admin JWT reads all approvals ---');
  const { data: ap, error: ape } = await ac.from('approvals').select('id,status');
  ape ? r('read approvals', false, ape.message) : r('read approvals', ap.length >= 1, `${ap.length} rows`);

  // TEST 5: approve (update approval row)
  console.log('\n--- T5: Admin JWT approves ---');
  const { data: up, error: upe } = await ac.from('approvals')
    .update({ status:'approved', decided_by: uid, decided_at: new Date().toISOString(), note:'LGTM' })
    .eq('id', APPR).select();
  upe ? r('approve', false, upe.message) : r('approve', up?.[0]?.status === 'approved', `status=${up?.[0]?.status}`);

  // TEST 6: admin cannot insert into agent_events (no insert policy for authenticated)
  // Our RLS only grants insert to service_role context — authenticated should fail
  console.log('\n--- T6: Admin JWT insert agent_events (expect blocked) ---');
  const { error: ie } = await ac.from('agent_events')
    .insert({ agent_id: AGENT_A, event_type:'HEARTBEAT', payload:{} });
  if (ie) {
    r('admin insert events blocked', true, `error: ${ie.message}`);
  } else {
    r('admin insert events blocked', false, 'insert succeeded — tighten policy');
  }

  // -- cleanup --
  await svc.auth.admin.deleteUser(uid);
  console.log(`\nCleaned up user ${EMAIL}`);

  console.log(`\n=== SUMMARY: ${ok} PASSED, ${nok} FAILED ===`);
  console.log(nok === 0 ? '\nADMIN JWT VERDICT: PASS' : '\nADMIN JWT VERDICT: FAIL');
  process.exit(nok > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
