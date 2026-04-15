import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pdfParseEntry = require.resolve('pdf-parse');
const workerPath = path.join(path.dirname(pdfParseEntry), '..', 'esm', 'pdf.worker.mjs');

assert.ok(fs.existsSync(pdfParseEntry), 'pdf-parse entry should resolve from the runtime package graph');
assert.ok(fs.existsSync(workerPath), 'pdf.worker.mjs should resolve relative to the installed pdf-parse package');

console.log('PASS pdf-parse worker path resolves from the installed package entry');
console.log(JSON.stringify({ pdfParseEntry, workerPath }, null, 2));
