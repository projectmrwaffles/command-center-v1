import assert from 'node:assert/strict';
import Module from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const textPdfDoc = await PDFDocument.create();
const textFont = await textPdfDoc.embedFont(StandardFonts.Helvetica);
const textPdfPage = textPdfDoc.addPage([612, 792]);
textPdfPage.drawText('Project must use Next.js and React.', { x: 72, y: 720, size: 12, font: textFont });
textPdfPage.drawText('The UI should use Tailwind CSS and shadcn/ui.', { x: 72, y: 700, size: 12, font: textFont });
textPdfPage.drawText('The app should feel fast and reliable.', { x: 72, y: 680, size: 12, font: textFont });
const textPdfFixture = Buffer.from(await textPdfDoc.save());

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

const scannedImage = makeImageBuffer(['Use Next.js and React', 'Tailwind CSS required']);
const scannedPdfDoc = await PDFDocument.create();
const scannedPage = scannedPdfDoc.addPage([1200, 700]);
const embeddedImage = await scannedPdfDoc.embedPng(scannedImage);
scannedPage.drawImage(embeddedImage, { x: 0, y: 0, width: 1200, height: 700 });
const scannedPdfFixture = Buffer.from(await scannedPdfDoc.save());

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
  const { extractRequirementsFromUploadedFile, deriveProjectRequirements } = await import('../src/lib/project-requirements.ts');

  const extractedTextPdf = await extractRequirementsFromUploadedFile({
    buffer: textPdfFixture,
    mimeType: 'application/pdf',
    title: 'serverless-text.pdf',
    type: 'prd_pdf',
  });
  assert.match(extractedTextPdf.text || '', /next\.js/i, 'text PDFs should extract without canvas in serverless mode');

  const requirements = deriveProjectRequirements({ documents: [extractedTextPdf] });
  assert.ok(requirements.summary.some((line) => /tailwind/i.test(line)), 'derived requirements should keep PDF evidence without canvas');

  const extractedScannedPdf = await extractRequirementsFromUploadedFile({
    buffer: scannedPdfFixture,
    mimeType: 'application/pdf',
    title: 'serverless-scanned.pdf',
    type: 'prd_pdf',
  });
  assert.equal(typeof extractedScannedPdf.text, 'string', 'scanned PDFs should degrade gracefully without crashing when canvas is unavailable');
  assert.ok((extractedScannedPdf.text || '').length < 80, 'scanned PDFs should degrade cleanly instead of attempting runtime OCR branches');

  console.log('PASS serverless-safe PDF extraction keeps text PDFs working and scanned PDFs deterministic without canvas');
} finally {
  Module._load = originalLoad;
  Module._resolveFilename = originalResolveFilename;
  if (originalVercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }
}
