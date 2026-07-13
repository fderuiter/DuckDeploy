import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { discoverResources } from '@duckdeploy/openapi';

const SRC_DIR = path.resolve('src');
const OPENAPI_FILE = path.resolve('openapi.yaml');
const PRUNED_FILE = path.resolve('openapi.pruned.yaml');

// Helper to escape regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Check usage of a term with word boundary if applicable
function checkUsage(content, term) {
  if (/^\w/.test(term) && /\w$/.test(term)) {
    return new RegExp('\\b' + escapeRegExp(term) + '\\b').test(content);
  }
  return content.includes(term);
}

async function getFiles(dir) {
  const dirents = await fsPromises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    // Exclude generated API directory
    if (res.includes('/api/generated') || res.includes('\\api\\generated')) return [];
    return dirent.isDirectory() ? getFiles(res) : res;
  }));
  return Array.prototype.concat(...files);
}

async function main() {
  console.log('Loading OpenAPI specification...');
  const specContent = await fsPromises.readFile(OPENAPI_FILE, 'utf8');
  const spec = yaml.load(specContent);
  
  if (!spec || !spec.paths) {
    console.log('No valid paths found in OpenAPI spec.');
    return;
  }

  const resources = discoverResources(spec);
  console.log(`Discovered ${resources.length} resources.`);

  const files = await getFiles(SRC_DIR);
  const srcFiles = files.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
  
  let allContent = '';
  for (const file of srcFiles) {
    const content = await fsPromises.readFile(file, 'utf8');
    allContent += '\n' + content;
  }

  const activeOperations = new Set();
  const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

  // Check which resources are active
  for (const resource of resources) {
    if (checkUsage(allContent, resource.name)) {
      console.log(`Resource used: ${resource.name}`);
      const ops = [
        resource.listOperationId,
        resource.createOperationId,
        resource.showOperationId,
        resource.editOperationId,
        resource.deleteOperationId
      ].filter(Boolean);
      ops.forEach(op => activeOperations.add(op));
    }
  }

  // Check standalone operations
  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    
    for (const method of Object.keys(pathItem)) {
      if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
      const operation = pathItem[method];
      if (!operation) continue;

      const operationId = operation.operationId;
      const operationKey =
        typeof operationId === 'string' && operationId.trim().length > 0
          ? operationId
          : `${method.toUpperCase()} ${pathKey}`;

      if (checkUsage(allContent, operationKey)) {
        console.log(`Operation directly used: ${operationKey}`);
        activeOperations.add(operationKey);
      }
    }
  }

  console.log(`Found ${activeOperations.size} active operations.`);

  // Prune spec
  const prunedSpec = { ...spec };
  prunedSpec.paths = {};

  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') {
      prunedSpec.paths[pathKey] = pathItem;
      continue;
    }
    
    const prunedPathItem = {};
    let hasActiveMethod = false;

    // Keep standard path-level parameters or servers if any (like parameters)
    for (const [k, v] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.includes(k.toLowerCase())) {
        prunedPathItem[k] = v;
      }
    }

    for (const method of Object.keys(pathItem)) {
      if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
      const operation = pathItem[method];
      if (!operation) continue;

      const operationId = operation.operationId;
      const operationKey =
        typeof operationId === 'string' && operationId.trim().length > 0
          ? operationId
          : `${method.toUpperCase()} ${pathKey}`;

      if (activeOperations.has(operationKey)) {
        prunedPathItem[method] = operation;
        hasActiveMethod = true;
      }
    }

    if (hasActiveMethod) {
      prunedSpec.paths[pathKey] = prunedPathItem;
    }
  }

  const yamlStr = yaml.dump(prunedSpec, { noRefs: true, lineWidth: -1 });
  await fsPromises.writeFile(PRUNED_FILE, yamlStr, 'utf8');
  console.log(`Pruned specification written to ${PRUNED_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
