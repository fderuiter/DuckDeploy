import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import ts from 'typescript';
import { discoverResources } from '@duckdeploy/openapi';
import { loadSpecAsync, repoRoot } from './openapi-utility.mjs';

const SRC_DIR = path.join(repoRoot, 'src');
const PRUNED_FILE = path.join(repoRoot, 'openapi.pruned.yaml');

function normalize(str) {
  if (!str) return '';
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // Split camelCase/PascalCase transitions
    .replace(/[-_]+/g, '_')                  // Convert hyphens and multiple underscores to single underscore
    .toLowerCase()
    .trim();
}

function extractTokens(sourceFile, tokens) {
  function visit(node) {
    if (ts.isIdentifier(node)) {
      tokens.add(node.text);
    } else if (ts.isStringLiteral(node)) {
      tokens.add(node.text);
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      tokens.add(node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      tokens.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
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
  const spec = await loadSpecAsync();
  
  if (!spec || !spec.paths) {
    console.log('No valid paths found in OpenAPI spec.');
    return;
  }

  const resources = discoverResources(spec);
  console.log(`Discovered ${resources.length} resources.`);

  const files = await getFiles(SRC_DIR);
  const srcFiles = files.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
  
  const rawTokens = new Set();
  for (const file of srcFiles) {
    const content = await fsPromises.readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true
    );
    extractTokens(sourceFile, rawTokens);
  }

  const normalizedTokens = new Set([...rawTokens].map(normalize));

  const activeOperations = new Set();
  const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

  // Check which resources are active
  for (const resource of resources) {
    const normalizedResourceName = normalize(resource.name);
    let isUsed = false;
    
    // Check normalized tokens
    for (const nTok of normalizedTokens) {
      if (nTok.includes(normalizedResourceName) || nTok === normalizedResourceName) {
        isUsed = true;
        break;
      }
    }
    
    // Check raw tokens
    if (!isUsed) {
      for (const tok of rawTokens) {
        if (tok.includes(resource.name) || tok === resource.name) {
          isUsed = true;
          break;
        }
      }
    }

    if (isUsed) {
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

      let isUsed = false;

      if (typeof operationId === 'string' && operationId.trim().length > 0) {
        const normalizedOperationId = normalize(operationId);
        
        if (normalizedTokens.has(normalizedOperationId)) {
          isUsed = true;
        } else {
          for (const tok of rawTokens) {
            if (tok.includes(operationId) || tok === operationId) {
              isUsed = true;
              break;
            }
          }
        }
      } else {
        // Fallback for no operationId
        for (const tok of rawTokens) {
          if (tok.includes(operationKey) || tok === operationKey) {
            isUsed = true;
            break;
          }
        }
      }

      if (isUsed) {
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
