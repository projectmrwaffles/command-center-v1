import assert from 'node:assert/strict';

const pdfFixture = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 153 >>
stream
BT
/F1 12 Tf
72 720 Td
(Project must use Next.js and React.) Tj
0 -16 Td
(The UI should use Tailwind CSS and shadcn/ui.) Tj
0 -16 Td
(The app should feel fast and reliable.) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000063 00000 n 
0000000122 00000 n 
0000000248 00000 n 
0000000318 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
521
%%EOF`);

const originalVercel = process.env.VERCEL;
process.env.VERCEL = '1';

const { extractRequirementsFromUploadedFile, deriveProjectRequirements } = await import('../src/lib/project-requirements.ts');

const extracted = await extractRequirementsFromUploadedFile({
  buffer: pdfFixture,
  mimeType: 'application/pdf',
  title: 'notes_vault_prd.pdf',
  type: 'prd_pdf',
});
const requirements = deriveProjectRequirements({ documents: [extracted] });

assert.ok((extracted.text || '').length > 10, 'PDF text extraction should still work when VERCEL is set');
assert.ok(requirements.sourceCount > 0, 'attachment-derived requirements should still be produced when VERCEL is set');
assert.ok(
  requirements.summary.some((line) => /next\.js/i.test(line)),
  'fixture should preserve Next.js requirement evidence under Vercel-style runtime',
);

if (originalVercel === undefined) {
  delete process.env.VERCEL;
} else {
  process.env.VERCEL = originalVercel;
}

console.log('PASS attachment requirement extraction remains enabled under Vercel-style runtime');
