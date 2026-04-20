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
  const submissionId = 'eac3e90d-9597-4400-b867-84d017ba21b1';
  const project = (await db.from('projects').select('links').eq('id', projectId).single()).data;
  const links = { ...(project?.links || {}) };
  if (links.preview === 'http://127.0.0.1:3000') delete links.preview;
  const upd = await db.from('projects').update({ links }).eq('id', projectId);
  if (upd.error) throw upd.error;

  const bundles = (await db.from('proof_bundles').select('id').eq('submission_id', submissionId)).data || [];
  const bundleIds = bundles.map((b) => b.id);
  if (bundleIds.length) {
    const del = await db.from('proof_items').delete().in('proof_bundle_id', bundleIds).eq('kind', 'staging_url').eq('url', 'http://127.0.0.1:3000');
    if (del.error) throw del.error;
  }

  const freshProject = (await db.from('projects').select('links').eq('id', projectId).single()).data;
  const items = bundleIds.length
    ? (await db.from('proof_items').select('kind,label,url,storage_path').in('proof_bundle_id', bundleIds)).data
    : [];

  console.log(JSON.stringify({ links: freshProject?.links, items }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
