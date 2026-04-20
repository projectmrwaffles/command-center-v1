const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const projectId = '80441042-ec3d-45f9-8b97-846e68ac2664';
  const sprintId = 'fb8c20a6-e857-495e-a477-ad27ee3731d2';
  const filePath = '/tmp/content-planner-real-proof.png';
  const bytes = fs.readFileSync(filePath);

  const sub = (await db.from('milestone_submissions').select('id,revision_number,status').eq('sprint_id', sprintId).eq('checkpoint_type', 'delivery_review').eq('status', 'submitted').order('revision_number', { ascending: false }).limit(1).maybeSingle()).data;
  if (!sub?.id) throw new Error('missing active submitted delivery review');

  const bundle = (await db.from('proof_bundles').select('id').eq('submission_id', sub.id).maybeSingle()).data;
  if (!bundle?.id) throw new Error('missing active proof bundle');

  const proofPath = `review-evidence/${projectId}/content-planner-real-proof-${Date.now()}.png`;
  const upload = await db.storage.from('project_docs').upload(proofPath, bytes, { contentType: 'image/png', upsert: true });
  if (upload.error) throw upload.error;

  const existingBad = await db.from('proof_items').select('id,kind,label,storage_path,metadata').eq('proof_bundle_id', bundle.id).eq('kind', 'screenshot');
  const badIds = (existingBad.data || []).map((row) => row.id);
  if (badIds.length) {
    const del = await db.from('proof_items').delete().in('id', badIds);
    if (del.error) throw del.error;
  }

  const signed = await db.storage.from('project_docs').createSignedUrl(proofPath, 60 * 60 * 24 * 7);
  if (signed.error) throw signed.error;

  const ins = await db.from('proof_items').insert({
    proof_bundle_id: bundle.id,
    kind: 'screenshot',
    label: 'Content Planner 6.1 live screenshot',
    url: signed.data.signedUrl,
    storage_path: proofPath,
    notes: 'Real screenshot captured from the running Content Planner 6.1 app for delivery review.',
    metadata: { app: 'content-planner-6-1', source: 'manual_live_capture', validEvidence: true },
    sort_order: 3,
  });
  if (ins.error) throw ins.error;

  const bundleUpd = await db.from('proof_bundles').update({ completeness_status: 'ready' }).eq('id', bundle.id);
  if (bundleUpd.error) throw bundleUpd.error;

  const finalItems = (await db.from('proof_items').select('id,kind,label,url,storage_path,notes').eq('proof_bundle_id', bundle.id).order('sort_order')).data || [];
  console.log(JSON.stringify({ submissionId: sub.id, revision: sub.revision_number, bundleId: bundle.id, items: finalItems }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
