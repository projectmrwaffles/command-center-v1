import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { createCanvas } from '@napi-rs/canvas';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { PDFDocument, StandardFonts } from 'pdf-lib';

dotenv.config({ path: '.env.local' });

const { runAttachmentWorkerOnce } = await import('./attachment-worker.mjs');

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const db = createClient(baseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function buildTextPdfFixture() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([612, 792]);
  page.drawText('Project must use Next.js and React.', { x: 72, y: 720, size: 12, font });
  page.drawText('The UI should use Tailwind CSS and shadcn/ui.', { x: 72, y: 700, size: 12, font });
  page.drawText('Supabase should back auth and data.', { x: 72, y: 680, size: 12, font });
  return Buffer.from(await pdfDoc.save());
}

function makeImageBuffer(lines) {
  const canvas = createCanvas(1200, 700);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 48px Arial';
  let y = 120;
  for (const line of lines) {
    ctx.fillText(line, 60, y);
    y += 90;
  }
  return canvas.toBuffer('image/png');
}

async function buildScannedPdfFixture() {
  const image = makeImageBuffer(['Use Next.js and React', 'Tailwind CSS required']);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([1200, 700]);
  const embedded = await pdfDoc.embedPng(image);
  page.drawImage(embedded, { x: 0, y: 0, width: 1200, height: 700 });
  return Buffer.from(await pdfDoc.save());
}

async function must(label, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function waitForServer(origin, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = null;
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(origin, { redirect: 'manual' });
      if (response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for built server at ${origin}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function startBuiltServer(port) {
  const child = spawn('node_modules/.bin/next', ['start', '-H', '127.0.0.1', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });
  return { child, getLogs: () => logs };
}

async function stopBuiltServer(server) {
  if (!server || server.killed) return;
  server.kill('SIGTERM');
  await Promise.race([
    once(server, 'exit').catch(() => {}),
    delay(5000).then(() => {
      if (!server.killed) server.kill('SIGKILL');
    }),
  ]);
}

async function main() {
  const stamp = `built-runtime-worker-${Date.now()}`;
  const port = 3300 + Math.floor(Math.random() * 200);
  const origin = `http://127.0.0.1:${port}`;
  const textPdfFixture = await buildTextPdfFixture();
  const scannedPdfFixture = await buildScannedPdfFixture();
  const createdProject = await must(
    'insert project fixture',
    db.from('projects').insert({
      name: `Built Runtime Worker Fixture ${stamp}`,
      status: 'active',
      type: 'product_build',
      intake: {
        summary: 'Use uploaded documents to derive implementation requirements.',
      },
    }).select('id,name').single(),
  );

  const server = startBuiltServer(port);

  try {
    await waitForServer(origin);

    const formData = new FormData();
    formData.append('files', new File([textPdfFixture], 'built-runtime-text.pdf', { type: 'application/pdf' }));
    formData.append('files', new File([scannedPdfFixture], 'built-runtime-scanned.pdf', { type: 'application/pdf' }));

    const uploadResponse = await fetch(`${origin}/api/projects/${createdProject.id}/documents/upload`, {
      method: 'POST',
      headers: {
        origin,
        referer: `${origin}/projects/${createdProject.id}`,
      },
      body: formData,
    });
    const uploadJson = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201, `upload failed: ${JSON.stringify(uploadJson)}`);
    assert.equal(uploadJson.intakeRequirementStatus, 'queued_for_worker_processing');
    assert.equal(uploadJson.kickoffStatus, 'queued_for_worker_processing');
    assert.equal(uploadJson.attachmentKickoffState?.status, 'upload_received');
    assert.ok(uploadJson.attachmentJob?.jobId, 'upload should enqueue a durable worker job');

    const queuedJob = await must(
      'load queued attachment job',
      db.from('jobs').select('id,status,summary,project_id').eq('id', uploadJson.attachmentJob.jobId).single(),
    );
    assert.equal(queuedJob.status, 'queued');
    assert.equal(queuedJob.project_id, createdProject.id);

    const workerResults = await runAttachmentWorkerOnce();
    const workerResult = workerResults.find((entry) => entry.projectId === createdProject.id);
    assert.ok(workerResult, 'worker should claim and process the queued upload job');
    assert.equal(workerResult.status, 'completed');
    assert.equal(workerResult.attachmentRequirementsReady, true);

    const processedProject = await must(
      'load processed project',
      db.from('projects').select('id,intake').eq('id', createdProject.id).single(),
    );
    const requirements = processedProject.intake?.requirements;
    assert.ok(Array.isArray(requirements?.summary), 'worker should persist derived requirements');
    assert.ok(requirements.summary.some((line) => /next\.js/i.test(line)), 'derived requirements should preserve Next.js evidence');
    assert.ok(requirements.summary.some((line) => /tailwind/i.test(line)), 'derived requirements should preserve Tailwind evidence');

    const processedJob = await must(
      'load completed job',
      db.from('jobs').select('id,status').eq('id', queuedJob.id).single(),
    );
    assert.equal(processedJob.status, 'completed');

    const sprintCountResult = await db.from('sprints').select('id', { count: 'exact', head: true }).eq('project_id', createdProject.id);
    if (sprintCountResult.error) throw new Error(`load sprint count: ${sprintCountResult.error.message}`);
    assert.ok((sprintCountResult.count || 0) > 0, 'processed project should have kickoff sprints after worker finalization');

    console.log('PASS built Next runtime queues attachment jobs and the attachment worker processes them end-to-end');
    console.log(JSON.stringify({
      projectId: createdProject.id,
      queuedJobId: queuedJob.id,
      workerResult,
      attachmentKickoffState: processedProject.intake?.attachmentKickoffState || null,
      requirementsSummary: requirements?.summary || [],
      sprintCount: sprintCountResult.count || 0,
      origin,
    }, null, 2));
  } finally {
    try {
      await fetch(`${origin}/api/projects/${createdProject.id}`, {
        method: 'DELETE',
        headers: {
          origin,
          referer: `${origin}/projects/${createdProject.id}`,
        },
      });
    } catch {}
    await stopBuiltServer(server.child);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
