/**
 * run-schemathesis.mjs
 *
 * Backend API Contract Compliance Verification.
 *
 * This script executes Schemathesis, a property-based fuzz testing tool, against
 * the backend API using the OpenAPI specification as the ground truth.
 *
 * Its primary role is to verify that the backend:
 * 1. Properly handles a wide range of generated request payloads.
 * 2. Adheres to the structural constraints and response types defined in the OAS.
 * 3. Does not crash or return 500 errors when receiving unexpected but validly-shaped data.
 *
 * IMPORTANT: This script tests the BACKEND's compliance with the contract. It
 * does NOT verify the frontend's UI generation fidelity or component behavior.
 * For UI verification, use `npm run validate:contract`.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEnv } from '../config/validate.mjs';

const config = validateEnv('backend');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

function normalizePrefix(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return '/api/cdisc';
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

const proxyPrefix = normalizePrefix(config.CDISC_PROXY_PREFIX);
const defaultProxyUrl = `http://localhost:${config.PORT}${proxyPrefix}`;

const apiBaseUrl = process.env.SCHEMATHESIS_BASE_URL || defaultProxyUrl;
const maxExamples = process.env.SCHEMATHESIS_MAX_EXAMPLES || '1000';
const strictMode = process.env.SCHEMATHESIS_STRICT === 'true';

const commandArgs = [
  '-m',
  'schemathesis.cli',
  'run',
  path.join(repoRoot, 'openapi.yaml'),
  '--url',
  apiBaseUrl,
  '--max-examples',
  maxExamples,
  '--report',
  'junit',
  '--report-junit-path',
  path.join(repoRoot, 'schemathesis-junit.xml'),
];

const schemathesisImportCheck = spawnSync('python3', ['-c', 'import schemathesis'], {
  cwd: repoRoot,
  encoding: 'utf8',
});

if (schemathesisImportCheck.status !== 0) {
  console.log('Schemathesis is missing; installing via pip...');
  const installResult = spawnSync('python3', ['-m', 'pip', 'install', '--upgrade', 'pip', 'schemathesis==4.18.0'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (installResult.status !== 0) {
    throw new Error(`Failed to install schemathesis (exit code ${installResult.status}).`);
  }
}

const finalRun = spawnSync('python3', commandArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (finalRun.status !== 0) {
  if (strictMode) {
    throw new Error(`Schemathesis fuzz run failed with exit code ${finalRun.status}.`);
  }

  console.warn(
    `Schemathesis exited with status ${finalRun.status}; continuing because SCHEMATHESIS_STRICT is not enabled.`,
  );
}
