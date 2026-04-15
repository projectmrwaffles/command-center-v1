require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const baseUrl = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function must(label, promise) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function main() {
  const stamp = `delete-fixture-${Date.now()}`;
  const project = await must(
    'insert project',
    db.from('projects').insert({
      name: `Project Delete Fixture ${stamp}`,
      status: 'active',
      type: 'product_build',
    }).select('id,name').single()
  );

  const agent = await must(
    'load agent',
    db.from('agents').select('id,name').limit(1).single()
  );

  const job = await must(
    'insert job',
    db.from('jobs').insert({
      project_id: project.id,
      title: `Job Delete Fixture ${stamp}`,
      status: 'completed',
      owner_agent_id: agent.id,
      summary: 'Fixture for project delete verification',
    }).select('id').single()
  );

  const storagePath = `${project.id}/fixtures/delete-proof.txt`;
  await must(
    'upload storage fixture',
    db.storage.from('project_docs').upload(storagePath, Buffer.from(`delete-fixture-${stamp}`), {
      contentType: 'text/plain',
      upsert: false,
    })
  );

  await must(
    'insert project document fixture',
    db.from('project_documents').insert({
      project_id: project.id,
      type: 'other',
      title: `Delete Fixture ${stamp}`,
      storage_path: storagePath,
      mime_type: 'text/plain',
      size_bytes: Buffer.byteLength(`delete-fixture-${stamp}`),
    }).select('id').single()
  );

  await must(
    'insert approval fixture',
    db.from('approvals').insert({
      job_id: job.id,
      agent_id: agent.id,
      project_id: null,
      status: 'pending',
      summary: 'Approval linked only by job for delete verification',
    }).select('id').single()
  );

  await must(
    'insert agent event fixture',
    db.from('agent_events').insert({
      agent_id: agent.id,
      project_id: null,
      job_id: job.id,
      event_type: 'project_delete_fixture',
      payload: { fixture: true, stamp },
    }).select('id').single()
  );

  await must(
    'insert ai usage fixture',
    db.from('ai_usage').insert({
      agent_id: agent.id,
      project_id: project.id,
      job_id: job.id,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      tokens_in: 1,
      tokens_out: 1,
      total_tokens: 2,
      cost_usd: 0,
    }).select('id').single()
  );

  await must(
    'insert ai usage events fixture',
    db.from('ai_usage_events').insert({
      agent_id: agent.id,
      project_id: project.id,
      job_id: job.id,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      tokens_in: 2,
      tokens_out: 3,
      total_tokens: 5,
      cost_usd: 0.001,
    }).select('id').single()
  );

  const deleteRes = await fetch(`${baseUrl}/api/projects/${project.id}`, {
    method: 'DELETE',
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/projects/${project.id}`,
    },
  });
  const deleteJson = await deleteRes.json().catch(() => ({}));

  if (!deleteRes.ok) {
    throw new Error(`delete request failed: ${deleteRes.status} ${JSON.stringify(deleteJson)}`);
  }

  const [projectCheck, jobCheck, approvalCheck, eventCheck, usageCheck, usageEventCheck, usageRollupCheck, documentCheck, storageCheck] = await Promise.all([
    db.from('projects').select('id', { count: 'exact', head: true }).eq('id', project.id),
    db.from('jobs').select('id', { count: 'exact', head: true }).eq('id', job.id),
    db.from('approvals').select('id', { count: 'exact', head: true }).eq('job_id', job.id),
    db.from('agent_events').select('id', { count: 'exact', head: true }).eq('job_id', job.id),
    db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('job_id', job.id),
    db.from('ai_usage_events').select('id', { count: 'exact', head: true }).eq('job_id', job.id),
    db.from('usage_rollup_minute').select('*', { count: 'exact', head: true }).eq('project_id', project.id),
    db.from('project_documents').select('id', { count: 'exact', head: true }).eq('project_id', project.id),
    db.storage.from('project_docs').list(project.id, { limit: 1000, offset: 0 }),
  ]);

  const leftovers = {
    project: projectCheck.count,
    job: jobCheck.count,
    approvals: approvalCheck.count,
    agent_events: eventCheck.count,
    ai_usage: usageCheck.count,
    ai_usage_events: usageEventCheck.count,
    usage_rollup_minute: usageRollupCheck.count,
    project_documents: documentCheck.count,
    storage_entries: (storageCheck.data || []).length,
  };

  if (Object.values(leftovers).some((count) => (count || 0) > 0)) {
    throw new Error(`delete left fixture rows behind: ${JSON.stringify(leftovers)}`);
  }

  console.log(JSON.stringify({ ok: true, projectId: project.id, jobId: job.id, leftovers, deleteJson }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
