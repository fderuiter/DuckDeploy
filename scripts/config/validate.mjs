import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../config.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const pkgPath = path.resolve(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

/**
 * Validates the environment configuration against the schema.
 * @param {string} [context='backend'] - The validation context ('frontend' or 'backend').
 * @returns {Record<string, unknown>} The validated environment config.
 */
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

  const envConfig = {};
  for (const key of Object.keys(schema.properties)) {
    if (process.env[key] !== undefined && process.env[key] !== '') {
      envConfig[key] = process.env[key];
    }
  }

  const ajv = new Ajv({
    allErrors: true,
    useDefaults: true,
    coerceTypes: true,
    strict: false,
  });

  const contextSchema = structuredClone(schema);
  if (context === 'frontend') {
    contextSchema.required = (contextSchema.required || []).filter(req => {
      const prop = contextSchema.properties[req];
      return !(prop.secret === true || prop.public === false);
    });
  }

  const validate = ajv.compile(contextSchema);
  const isValid = validate(envConfig);

  if (!isValid) {
    console.error('Environment configuration validation failed:');
    validate.errors.forEach(err => {
      console.error(` - ${err.instancePath || 'config'} ${err.message}`);
    });
    process.exit(1);
  }

  return envConfig;
}
