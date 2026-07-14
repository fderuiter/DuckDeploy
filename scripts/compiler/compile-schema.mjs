import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { compileSpec, SCHEMA_FILENAME } from '@duckdeploy/openapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const inputPath = path.join(repoRoot, 'openapi.yaml');
const outputPath = path.join(repoRoot, 'public', SCHEMA_FILENAME);

const compile = async () => {
  const source = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(source);

  const optimized = await compileSpec(parsed);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(optimized), 'utf8');

  console.log(`Compiled OpenAPI schema to ${path.relative(repoRoot, outputPath)}`);
};

compile().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
