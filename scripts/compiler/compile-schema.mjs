import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSpecAsync, repoRoot } from '../openapi-utility.mjs';
import { compileSpec, SCHEMA_FILENAME } from '@duckdeploy/openapi';

const outputPath = path.join(repoRoot, 'public', SCHEMA_FILENAME);

const compile = async () => {
  const parsed = await loadSpecAsync();

  const optimized = await compileSpec(parsed);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(optimized), 'utf8');

  console.log(`Compiled OpenAPI schema to ${path.relative(repoRoot, outputPath)}`);
};

compile().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
