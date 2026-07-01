import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distRoot = path.join(repoRoot, 'dist', 'compliance');

if (!fs.existsSync(distRoot)) {
  fs.mkdirSync(distRoot, { recursive: true });
}

const files = [
  'traceability-matrix.json',
  'manifest-generation-log.json',
  'contract-validation-report.json',
  'junit.xml',
  'a11y-report.json'
];

for (const file of files) {
  const src = path.join(repoRoot, file);
  const dest = path.join(distRoot, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to dist/compliance/`);
  } else {
    console.warn(`File ${file} not found, skipping.`);
  }
}
