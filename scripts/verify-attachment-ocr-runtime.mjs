import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';

const originalVercel = process.env.VERCEL;
process.env.VERCEL = '1';

function makeTextImageBuffer(lines) {
  const canvas = createCanvas(1400, 900);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 52px Arial';
  let y = 120;
  for (const line of lines) {
    ctx.fillText(line, 80, y);
    y += 90;
  }
  return canvas.toBuffer('image/png');
}

const imageBuffer = makeTextImageBuffer([
  'Use Next.js and React',
  'Tailwind CSS required',
  'Supabase for auth and data',
]);

const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([900, 1200]);
const embeddedImage = await pdfDoc.embedPng(imageBuffer);
page.drawImage(embeddedImage, { x: 20, y: 240, width: 860, height: 553 });
const scannedPdfBuffer = Buffer.from(await pdfDoc.save());

const { extractAttachmentTextForTesting, deriveProjectRequirements, extractRequirementsFromUploadedFile, terminateAttachmentOcrWorkerForTesting } = await import('../src/lib/project-requirements.ts');

const imageText = await extractAttachmentTextForTesting({
  buffer: imageBuffer,
  mimeType: 'image/png',
  title: 'requirements.png',
});
assert.match(imageText, /next\.?js/i, 'image OCR should recover Next.js text under Vercel-style runtime');
assert.match(imageText, /tailwind/i, 'image OCR should recover Tailwind text under Vercel-style runtime');

const scannedPdfText = await extractAttachmentTextForTesting({
  buffer: scannedPdfBuffer,
  mimeType: 'application/pdf',
  title: 'scanned-requirements.pdf',
});
assert.match(scannedPdfText, /supabase/i, 'scanned PDF OCR should recover embedded image text under Vercel-style runtime');

const extracted = await extractRequirementsFromUploadedFile({
  buffer: scannedPdfBuffer,
  mimeType: 'application/pdf',
  title: 'scanned-requirements.pdf',
  type: 'prd_pdf',
});
const requirements = deriveProjectRequirements({ documents: [extracted] });
assert.ok(requirements.sourceCount > 0, 'attachment-derived requirements should be produced from OCR-backed scanned PDF text');
assert.ok(requirements.summary.some((line) => /next\.?js/i.test(line)), 'requirement summary should include OCR-derived Next.js evidence');
assert.ok(requirements.summary.some((line) => /tailwind/i.test(line)), 'requirement summary should include OCR-derived Tailwind evidence');

if (originalVercel === undefined) {
  delete process.env.VERCEL;
} else {
  process.env.VERCEL = originalVercel;
}

await terminateAttachmentOcrWorkerForTesting();
console.log('PASS deploy-safe OCR extraction works for direct images and scanned PDFs');
