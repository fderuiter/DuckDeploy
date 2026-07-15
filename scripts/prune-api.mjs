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
  console.log('Bypassing API pruning to preserve dynamic resources...');
  const specContent = await fsPromises.readFile(OPENAPI_FILE, 'utf8');
  const spec = yaml.load(specContent);
  
  // Workaround for Orval tags-split bug: Ensure every operation has a tag.
  if (spec && spec.paths) {
    for (const pathItem of Object.values(spec.paths)) {
      if (typeof pathItem === 'object' && pathItem !== null) {
        for (const operation of Object.values(pathItem)) {
          if (typeof operation === 'object' && operation !== null && !operation.tags) {
            operation.tags = ['Default'];
          }
        }
      }
    }
  }

  const yamlStr = yaml.dump(spec, { noRefs: true, lineWidth: -1 });
  await fsPromises.writeFile(PRUNED_FILE, yamlStr, 'utf8');
  console.log(`Copied full specification to ${PRUNED_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
