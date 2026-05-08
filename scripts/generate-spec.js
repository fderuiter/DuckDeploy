import fs from 'fs/promises';
import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateSpec() {
  try {
    const rootDir = path.resolve(__dirname, '..');
    const openapiPath = path.join(rootDir, 'openapi.yaml');
    const outputPath = path.join(rootDir, 'src', 'core', 'spec.json');

    const specRaw = await fs.readFile(openapiPath, 'utf8');
    const parsedJson = yaml.load(specRaw);

    if (!parsedJson || typeof parsedJson !== 'object') {
      throw new Error('Failed to parse OpenAPI YAML');
    }

    const resolvedSpec = await $RefParser.dereference(parsedJson, { dereference: { circular: 'ignore' } });

    await fs.writeFile(outputPath, JSON.stringify(resolvedSpec, null, 2));
    console.log('Successfully generated static spec.json');
  } catch (err) {
    console.error('Error generating spec.json:', err);
    process.exit(1);
  }
}

generateSpec();
