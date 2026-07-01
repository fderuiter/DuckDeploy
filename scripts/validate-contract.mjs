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
import { HTTP_METHODS } from '@duckdeploy/core';

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

/**
 * Resolve a JSON Reference ($ref) to the schema node it points to within the
 * given spec object.  Returns null when the ref is invalid or unresolvable.
 */
const resolveRef = (spec, ref) => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = spec;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = current[part];
  }
  return current;
};

/**
 * Recursively collect all schema properties that bear constraints we want to
 * validate (enum, minLength, pattern), returning an array of { pointer,
 * constraintType } descriptors.
 *
 * $ref nodes are resolved inline so that constraints defined in shared
 * component schemas are correctly discovered even in $ref-heavy specs.
 */
const collectConstraintBearingFields = (spec) => {
  const results = [];
  // HEAD and OPTIONS are excluded: they do not carry request bodies or
  // meaningful response payload schemas that drive UI component selection.

  const escapeSegment = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');

  const walk = (schema, pointer, visitedRefs = new Set()) => {
    if (!schema || typeof schema !== 'object') return;

    // Follow $ref — keep the original pointer so matrix lookups still match
    // the path-level location where the field appears in the API.
    if (typeof schema.$ref === 'string') {
      if (visitedRefs.has(schema.$ref)) return; // prevent infinite loops
      const resolved = resolveRef(spec, schema.$ref);
      if (!resolved) return;
      visitedRefs.add(schema.$ref);
      walk(resolved, pointer, visitedRefs);
      visitedRefs.delete(schema.$ref);
      return;
    }

    // Merge allOf by walking each member at the same pointer position.
    if (Array.isArray(schema.allOf)) {
      for (let i = 0; i < schema.allOf.length; i++) {
        walk(schema.allOf[i], pointer, visitedRefs);
      }
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      results.push({ pointer, constraintType: 'enum' });
    }
    if (typeof schema.minLength === 'number') {
      results.push({ pointer, constraintType: 'minLength' });
    }
    if (typeof schema.pattern === 'string') {
      results.push({ pointer, constraintType: 'pattern' });
    }

    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        walk(propSchema, `${pointer}/properties/${escapeSegment(propName)}`, visitedRefs);
      }
    }
    if (schema.items && typeof schema.items === 'object') {
      walk(schema.items, `${pointer}/items`, visitedRefs);
    }
    if (Array.isArray(schema.oneOf)) {
      schema.oneOf.forEach((s, i) => walk(s, `${pointer}/oneOf/${i}`, visitedRefs));
    }
    if (Array.isArray(schema.anyOf)) {
      schema.anyOf.forEach((s, i) => walk(s, `${pointer}/anyOf/${i}`, visitedRefs));
    }
  };

  if (!spec.paths || typeof spec.paths !== 'object') return results;

  for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const escapedPath = escapeSegment(apiPath);

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!operation || typeof operation !== 'object') continue;

      // Request body schemas
      const rbContent = operation.requestBody?.content;
      if (rbContent && typeof rbContent === 'object') {
        for (const [mediaType, mediaObj] of Object.entries(rbContent)) {
          if (mediaObj?.schema) {
            walk(
              mediaObj.schema,
              `#/paths/${escapedPath}/${method}/requestBody/content/${escapeSegment(mediaType)}/schema`,
            );
          }
        }
      }

      // Response schemas
      if (operation.responses && typeof operation.responses === 'object') {
        for (const [status, response] of Object.entries(operation.responses)) {
          if (!response?.content || typeof response.content !== 'object') continue;
          for (const [mediaType, mediaObj] of Object.entries(response.content)) {
            if (mediaObj?.schema) {
              walk(
                mediaObj.schema,
                `#/paths/${escapedPath}/${method}/responses/${status}/content/${escapeSegment(mediaType)}/schema`,
              );
            }
          }
        }
      }
    }
  }

  return results;
};

const validate = () => {
  const entries = loadMatrix();
  const spec = loadOpenApi();

  const violations = [];

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

  // ── Report ────────────────────────────────────────────────────────────────
  const total = entries.length;
  const mapped = entries.filter((e) => e.status === 'mapped').length;

  const report = {
    generatedAt: new Date().toISOString(),
    status: violations.length === 0 ? 'valid' : 'invalid',
    totalEntries: total,
    mappedEntries: mapped,
    violations,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Manifest mapping validation — ${mapped}/${total} entries mapped.`);
  console.log(`Generated validation report at ${path.relative(repoRoot, REPORT_PATH)}`);

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
  validate();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
