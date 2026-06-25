import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../config.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const pkgPath = path.resolve(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

export function validateEnv(context = 'backend') {
  // Enforce Node.js version
  if (pkg.engines && pkg.engines.node) {
    const semverRegex = />=|<=|>|<|=|\^|~/g;
    const requiredVersionStr = pkg.engines.node.replace(semverRegex, '').trim();
    const currentVersionStr = process.versions.node;
    const reqParts = requiredVersionStr.split('.').map(Number);
    const curParts = currentVersionStr.split('.').map(Number);

    let isCompatible = true;
    for (let i = 0; i < reqParts.length; i++) {
      if (curParts[i] > reqParts[i]) break;
      if (curParts[i] < reqParts[i]) {
        isCompatible = false;
        break;
      }
    }
    if (pkg.engines.node.includes('>=') && !isCompatible) {
      console.error(`Incompatible Node.js version. Required: ${pkg.engines.node}, Current: ${currentVersionStr}`);
      process.exit(1);
    }
  }

  const errors = [];
  const required = schema.required || [];

  for (const req of required) {
    const prop = schema.properties[req];
    // If frontend context, don't require backend secrets.
    if (context === 'frontend' && (prop.secret === true || prop.public === false)) {
      continue;
    }
    if (!process.env[req]) {
      errors.push(`Missing required environment variable: ${req}. ${prop.description || ''}`);
    }
  }

  for (const [key, prop] of Object.entries(schema.properties)) {
    const val = process.env[key];
    if (val !== undefined && val !== '') {
      if (prop.type === 'number') {
        const num = Number(val);
        if (Number.isNaN(num)) {
          errors.push(`Invalid type for ${key}: expected number, got "${val}"`);
        }
      } else if (prop.type === 'boolean') {
        if (val !== 'true' && val !== 'false') {
          errors.push(`Invalid type for ${key}: expected boolean ('true' or 'false'), got "${val}"`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('Environment configuration validation failed:');
    errors.forEach(err => console.error(` - ${err}`));
    process.exit(1);
  }
}
