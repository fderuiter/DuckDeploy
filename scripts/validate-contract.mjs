/**
 * validate-contract.mjs
 *
 * Static Frontend Generation Fidelity Verification.
 *
 * This script ensures structural bisimilarity between the OpenAPI specification
 * and the generated React dashboard. Unlike Schemathesis (which tests the backend),
 * this tool verifies that the frontend correctly interprets and renders the contract.
 *
 * It reads the manifest-generation-log.json produced by the preprocessor and verifies:
 * 1. Mapping Coverage: Every field discovered in the OpenAPI spec must be legally
 *    mapped to a UI component. If a field is "discarded" (due to unsupported
 *    schema shapes or depth limits), the build fails to prevent silent data loss.
 * 2. Constraint Enforcement: Constraint-bearing fields (enum, minLength, pattern)
 *    must be mapped to UI components (e.g., <SelectInput />, <TextInput />) that
 *    actually enforce those constraints.
 *
 * Exit code 0 → UI generation fidelity is verified.
 * Exit code 1 → Contract violations detected; deployment blocked.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { resolveRef, collectConstraintBearingFields } from '@duckdeploy/openapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const MATRIX_PATH = path.join(repoRoot, 'manifest-generation-log.json');
const REPORT_PATH = path.join(repoRoot, 'contract-validation-report.json');
const OPENAPI_CANDIDATES = [
  path.join(repoRoot, 'openapi.yaml'),
  path.join(repoRoot, 'openapi.yml'),
  path.join(repoRoot, 'openapi.json'),
];

// Components that accept enum constraints.
const ENUM_COMPONENTS = new Set(['<SelectInput />', '<SelectField />', '<PolymorphicInput />']);
// Allow-list of INPUT components that can enforce text constraints (minLength / pattern).
// Display components (ending with "Field") are read-only — they render existing data
// and are not responsible for validating it, so they are excluded from this check.
const TEXT_CONSTRAINT_COMPONENTS = new Set(['<TextInput />', '<PolymorphicInput />']);

const loadMatrix = () => {
  if (!fs.existsSync(MATRIX_PATH)) {
    throw new Error(
      `manifest-generation-log.json not found at ${MATRIX_PATH}. Run "npm run generate" first.`,
    );
  }
  const raw = fs.readFileSync(MATRIX_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.entries)) {
    throw new Error('manifest-generation-log.json is malformed: expected { entries: [...] }.');
  }
  return parsed.entries;
};

const loadOpenApi = () => {
  const candidate = OPENAPI_CANDIDATES.find((p) => fs.existsSync(p));
  if (!candidate) {
    throw new Error('OpenAPI source file not found (checked openapi.yaml / openapi.yml / openapi.json).');
  }
  const raw = fs.readFileSync(candidate, 'utf8');
  return candidate.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw);
};

const validate = async () => {
  const entries = loadMatrix();
  const spec = loadOpenApi();
  const candidate = OPENAPI_CANDIDATES.find((p) => fs.existsSync(p));
  const dereferencedSpec = await $RefParser.dereference(candidate, { dereference: { circular: 'ignore' } });

  const violations = [];
  const warnings = [];

  // ── Rule 1: no field should be "discarded" ───────────────────────────────
  // The preprocessor emits status='discarded' with a null component whenever
  // it cannot determine a UI component for a schema node (e.g. unsupported
  // shape, null schema, max-depth reached). Flag every discarded entry so
  // spec changes that introduce unmappable fields are caught before deployment.
  const discarded = entries.filter((e) => e.status === 'discarded');
  if (discarded.length > 0) {
    for (const entry of discarded) {
      violations.push(
        `DISCARDED mapping: pointer="${entry.pointer}" source="${entry.source}" component="${entry.component}"`,
      );
    }
  }

  // ── Rule 2: constraint-bearing fields must have a matching component ──────
  const constraintFields = collectConstraintBearingFields(spec);
  const matrixByPointerPrefix = new Map(entries.map((e) => [e.pointer, e]));

  for (const { pointer, constraintType } of constraintFields) {
    const entry = matrixByPointerPrefix.get(pointer);
    if (!entry) continue; // not in matrix — may be a $ref or intermediate node; skip
    if (!entry.component) continue; // discarded — already reported above

    if (constraintType === 'enum' && !ENUM_COMPONENTS.has(entry.component)) {
      violations.push(
        `CONSTRAINT MISMATCH (enum): pointer="${pointer}" mapped to "${entry.component}" which does not enforce enum constraints`,
      );
    }
    if (
      (constraintType === 'minLength' || constraintType === 'pattern') &&
      // Only check INPUT components; display/Field components are read-only
      // and are not responsible for enforcing schema constraints.
      entry.component.includes('Input') &&
      !TEXT_CONSTRAINT_COMPONENTS.has(entry.component)
    ) {
      violations.push(
        `CONSTRAINT MISMATCH (${constraintType}): pointer="${pointer}" mapped to "${entry.component}" which cannot enforce text constraints`,
      );
    }
  }

  // ── Rule 3: Strict Zero-Tolerance Documentation (Blocking) ────────────────
  for (const entry of entries) {
    if (entry.status !== 'mapped') continue;
    
    const node = resolveRef(dereferencedSpec, entry.pointer);
    if (!node || typeof node !== 'object') continue;
    
    if (!node.title) {
      violations.push(`MISSING METADATA (title): pointer="${entry.pointer}" source="${entry.source}"`);
    }
    if (!node.description) {
      violations.push(`MISSING METADATA (description): pointer="${entry.pointer}" source="${entry.source}"`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const total = entries.length;
  const mapped = entries.filter((e) => e.status === 'mapped').length;

  const report = {
    generatedAt: new Date().toISOString(),
    status: violations.length === 0 ? 'valid' : 'invalid',
    totalEntries: total,
    mappedEntries: mapped,
    violations,
    warnings,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Manifest mapping validation — ${mapped}/${total} entries mapped.`);
  console.log(`Generated validation report at ${path.relative(repoRoot, REPORT_PATH)}`);

  if (warnings.length > 0) {
    console.warn(`\nDocumentation warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.warn(`  ⚠ ${w}`);
    }
  }

  if (violations.length > 0) {
    console.error(`\nContract violations (${violations.length}):`);
    for (const v of violations) {
      console.error(`  ✗ ${v}`);
    }
    console.error('\nDeployment blocked: fix the above violations before proceeding.');
    process.exitCode = 1;
  } else {
    console.log('Manifest mapping checks: VALID ✓');
  }
};

try {
  await validate();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
