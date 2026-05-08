import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const apiBaseUrl = process.env.SCHEMATHESIS_BASE_URL || process.env.VITE_API_BASE_URL || 'https://api.library.cdisc.org';
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
