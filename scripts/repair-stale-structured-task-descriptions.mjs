import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUSPICIOUS_PATTERNS = [
  /BOOTSTRAP\.md/i,
  /Bootstrap is still pending/i,
  /identity\/preferences/i,
];

const TASK_TYPE_LABELS = {
  discovery_plan: 'Discovery / plan',
  design: 'Design',
  build_implementation: 'Build / implementation',
  content_messaging: 'Content / messaging',
  qa_validation: 'QA / validation',
  internal_admin: 'Internal / admin',
};

const TASK_METADATA_FIELDS = {
  discovery_plan: [
    ['planning_mode', 'Planning mode'],
    ['target_area', 'Target area'],
  ],
  design: [
    ['design_output_type', 'Output type'],
    ['surface', 'Surface'],
  ],
  build_implementation: [
    ['implementation_kind', 'Implementation kind'],
    ['target_environment', 'Target environment'],
  ],
  content_messaging: [
    ['content_type', 'Content type'],
    ['channel_or_surface', 'Channel or surface'],
  ],
  qa_validation: [
    ['qa_mode', 'QA mode'],
    ['subject_ref', 'What is being validated?'],
  ],
  internal_admin: [
    ['admin_action_type', 'Admin action'],
  ],
};

function humanize(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildCanonicalDescription(task, project) {
  const taskType = task.task_type;
  const goal = typeof task.task_goal === 'string' ? task.task_goal.trim() : '';
  if (!taskType || !goal) return null;

  const lines = [
    `Task type: ${TASK_TYPE_LABELS[taskType] || humanize(taskType)}`,
    `Goal: ${goal}`,
  ];

  const projectRequirements = project?.intake?.requirements?.summary?.slice(0, 6) || [];
  if (projectRequirements.length) {
    lines.push('Project requirements:', ...projectRequirements.map((item) => `- ${item}`));
  }

  for (const [key, label] of TASK_METADATA_FIELDS[taskType] || []) {
    const value = task.task_metadata?.[key];
    if (typeof value === 'string' && value.trim()) {
      lines.push(`${label}: ${value.replace(/_/g, ' ')}`);
    }
  }

  return lines.join('\n');
}

const { data: tasks, error } = await db
  .from('sprint_items')
  .select('id, project_id, title, description, task_type, task_goal, task_metadata')
  .order('updated_at', { ascending: false })
  .limit(5000);
if (error) throw error;

const candidates = tasks.filter((task) => {
  const description = typeof task.description === 'string' ? task.description : '';
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(description));
});

const results = [];
for (const task of candidates) {
  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id, intake')
    .eq('id', task.project_id)
    .maybeSingle();
  if (projectError) throw projectError;

  const replacement = buildCanonicalDescription(task, project);
  if (!replacement || replacement === task.description) {
    results.push({ id: task.id, action: 'skipped', reason: replacement ? 'already_canonical' : 'no_canonical_replacement' });
    continue;
  }

  const { error: updateError } = await db
    .from('sprint_items')
    .update({ description: replacement })
    .eq('id', task.id)
    .eq('description', task.description);
  if (updateError) throw updateError;

  const { data: after, error: afterError } = await db
    .from('sprint_items')
    .select('id, description')
    .eq('id', task.id)
    .maybeSingle();
  if (afterError) throw afterError;

  results.push({
    id: task.id,
    action: 'updated',
    before: task.description,
    after: after?.description || null,
  });
}

console.log(JSON.stringify({ candidateCount: candidates.length, results }, null, 2));
