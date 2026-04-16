import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { runAttachmentWorkerOnce } = await import('./attachment-worker.mjs');

const pollSeconds = Math.max(1, Number(process.env.ATTACHMENT_WORKER_POLL_SECONDS || '15'));
const runOnce = process.argv.includes('--once');

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function tick() {
  const startedAt = new Date().toISOString();
  const results = await runAttachmentWorkerOnce();
  console.log(JSON.stringify({ startedAt, processed: results.length, results }, null, 2));
}

async function main() {
  do {
    await tick();
    if (runOnce || stopping) break;
    await delay(pollSeconds * 1000);
  } while (!stopping);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
