import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distPath = path.join(repoRoot, 'dist');

const forbiddenPatterns = [/openapi\.ya?ml$/i, /schema-component-tree/i, /orval/i];

const walk = (currentPath, found = []) => {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, found);
      continue;
    }

    const relative = path.relative(distPath, absolute);
    if (forbiddenPatterns.some((pattern) => pattern.test(relative))) {
      found.push(relative);
    }
  }

  return found;
};

if (!fs.existsSync(distPath)) {
  throw new Error('dist folder does not exist. Run a production build before verifying cloaking.');
}

const matches = walk(distPath);
if (matches.length > 0) {
  throw new Error(`Shadow environment verification failed. Forbidden artifacts found in dist: ${matches.join(', ')}`);
}

console.log('Shadow environment verification passed: no raw OpenAPI/intermediate artifacts found in dist.');
