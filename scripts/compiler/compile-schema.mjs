import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const inputPath = path.join(repoRoot, 'openapi.yaml');
const outputPath = path.join(repoRoot, 'public', 'schema.json');

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

const toOperationId = (method, route) => {
  const routePart = route
    .replace(/^\/+/, '')
    .replace(/\{([^}]+)\}/g, 'By-$1')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'root';

  return `${method.toLowerCase()}-${routePart}`;
};

const pickPreferredMediaType = (content) => {
  if (!content || typeof content !== 'object') return content;

  if (content['application/json']) {
    return { 'application/json': content['application/json'] };
  }

  const [firstType] = Object.keys(content);
  return firstType ? { [firstType]: content[firstType] } : content;
};

const optimizeOperation = (route, method, operation) => {
  if (!operation || typeof operation !== 'object') return;

  if (!operation.operationId || typeof operation.operationId !== 'string') {
    operation.operationId = toOperationId(method, route);
  }

  if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
    const fallbackTag = route.split('/').filter(Boolean)[0] ?? 'default';
    operation.tags = [fallbackTag];
  }

  if (operation.requestBody?.content) {
    operation.requestBody.content = pickPreferredMediaType(operation.requestBody.content);
  }

  if (operation.responses && typeof operation.responses === 'object') {
    for (const response of Object.values(operation.responses)) {
      if (response && typeof response === 'object' && response.content) {
        response.content = pickPreferredMediaType(response.content);
      }
    }
  }
};

const stripNoise = (node) => {
  if (Array.isArray(node)) {
    for (const item of node) {
      stripNoise(item);
    }
    return;
  }

  if (!node || typeof node !== 'object') {
    return;
  }

  delete node.example;
  delete node.examples;

  for (const value of Object.values(node)) {
    stripNoise(value);
  }
};

const sortKeysDeep = (node) => {
  if (Array.isArray(node)) {
    return node.map(sortKeysDeep);
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  const sorted = {};
  for (const key of Object.keys(node).sort()) {
    sorted[key] = sortKeysDeep(node[key]);
  }

  return sorted;
};

const compile = async () => {
  const source = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(source);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid OpenAPI document: expected an object at root.');
  }

  const dereferenced = await $RefParser.dereference(parsed, {
    dereference: {
      circular: 'ignore',
    },
    mutateInputSchema: false,
  });

  if (dereferenced.paths && typeof dereferenced.paths === 'object') {
    for (const [route, pathItem] of Object.entries(dereferenced.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (!HTTP_METHODS.has(method.toLowerCase())) continue;
        optimizeOperation(route, method, operation);
      }
    }
  }

  stripNoise(dereferenced);
  const optimized = sortKeysDeep(dereferenced);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(optimized), 'utf8');

  console.log(`Compiled OpenAPI schema to ${path.relative(repoRoot, outputPath)}`);
};

compile().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
