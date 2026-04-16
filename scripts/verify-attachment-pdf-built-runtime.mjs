import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';

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

function loadBuiltProjectRequirementsModule() {
  const routeFsPath = path.join(process.cwd(), '.next/server/app/api/projects/[id]/documents/upload/route.js');
  if (!fs.existsSync(routeFsPath)) {
    throw new Error('Built route artifact missing. Run `next build` before built-runtime PDF verification.');
  }

  const routeRuntimePath = 'server/app/api/projects/[id]/documents/upload/route.js';
  const routeSource = fs.readFileSync(routeFsPath, 'utf8');
  const runtime = require('./../.next/server/chunks/[turbopack]_runtime.js')(routeRuntimePath);

  for (const match of routeSource.matchAll(/R\.c\("([^"]+)"\)/g)) {
    runtime.c(match[1]);
  }

  const projectRequirementsChunk = routeSource.match(/R\.c\("(server\/chunks\/src_lib_project-requirements_ts_[^"]+\._\.js)"\)/)?.[1];
  if (!projectRequirementsChunk) {
    throw new Error('Could not locate built project-requirements chunk from the built route artifact.');
  }

  const chunkSource = fs.readFileSync(path.join(process.cwd(), '.next', projectRequirementsChunk), 'utf8');
  const moduleId = Number(chunkSource.match(/^module\.exports=\[(\d+),/)?.[1]);
  if (!Number.isFinite(moduleId)) {
    throw new Error('Could not resolve built project-requirements module id.');
  }

  return runtime.m(moduleId).exports;
}

const require = Module.createRequire(import.meta.url);
const originalVercel = process.env.VERCEL;
process.env.VERCEL = '1';

const originalLoad = Module._load;
const originalResolveFilename = Module._resolveFilename;
const missingCanvasError = () => {
  const error = new Error("Cannot find module '@napi-rs/canvas'");
  error.code = 'MODULE_NOT_FOUND';
  return error;
};
Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  if (request === '@napi-rs/canvas') throw missingCanvasError();
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@napi-rs/canvas') throw missingCanvasError();
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const textPdfFixture = await buildTextPdfFixture();
  const scannedPdfFixture = await buildScannedPdfFixture();
  const { extractRequirementsFromUploadedFile, deriveProjectRequirements } = loadBuiltProjectRequirementsModule();

  const extractedTextPdf = await extractRequirementsFromUploadedFile({
    buffer: textPdfFixture,
    mimeType: 'application/pdf',
    title: 'built-runtime-text.pdf',
    type: 'prd_pdf',
  });
  assert.match(extractedTextPdf.text || '', /next\.js/i, 'built server artifact should extract text PDFs under Vercel-style runtime');

  const requirements = deriveProjectRequirements({ documents: [extractedTextPdf] });
  assert.ok(requirements.summary.some((line) => /tailwind/i.test(line)), 'built server artifact should preserve extracted PDF evidence');

  const extractedScannedPdf = await extractRequirementsFromUploadedFile({
    buffer: scannedPdfFixture,
    mimeType: 'application/pdf',
    title: 'built-runtime-scanned.pdf',
    type: 'prd_pdf',
  });
  assert.equal(typeof extractedScannedPdf.text, 'string', 'built server artifact should return a string for scanned PDFs');
  assert.ok((extractedScannedPdf.text || '').length < 80, 'built server artifact should degrade cleanly for scanned PDFs instead of doing runtime OCR roulette');

  console.log('PASS built server artifact keeps PDF extraction deterministic in Vercel-style runtime');
} finally {
  Module._load = originalLoad;
  Module._resolveFilename = originalResolveFilename;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
}
