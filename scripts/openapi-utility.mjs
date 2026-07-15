import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ES module-safe path resolution relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, '..');

const SUPPORTED_EXTENSIONS = ['yaml', 'yml', 'json'];

/**
 * Resolves the absolute path to the OpenAPI specification file.
 * Checks for supported extensions in the repository root.
 * @returns {string} The absolute path to the existing OpenAPI specification file.
 * @throws {Error} If no specification file is found.
 */
export function resolveSpecPath() {
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = path.join(repoRoot, `openapi.${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('OpenAPI source file not found (checked openapi.yaml, openapi.yml, openapi.json).');
}

/**
 * Parses the raw content of the OpenAPI specification.
 * @param {string} filePath - Path to the file
 * @param {string} rawContent - Raw string content
 * @returns {object} Parsed OpenAPI specification
 */
function parseRawContent(filePath, rawContent) {
  if (filePath.endsWith('.json')) {
    return JSON.parse(rawContent);
  }
  return yaml.load(rawContent);
}

/**
 * Synchronously loads and parses the OpenAPI specification.
 * @returns {object} Parsed OpenAPI specification
 */
export function loadSpecSync() {
  const specPath = resolveSpecPath();
  const raw = fs.readFileSync(specPath, 'utf8');
  return parseRawContent(specPath, raw);
}

/**
 * Asynchronously loads and parses the OpenAPI specification.
 * @returns {Promise<object>} Parsed OpenAPI specification
 */
export async function loadSpecAsync() {
  const specPath = resolveSpecPath();
  const raw = await fsPromises.readFile(specPath, 'utf8');
  return parseRawContent(specPath, raw);
}
