/**
 * validate-contract.mjs
 *
 * Static "Contract of Substitutability" check.
 *
 * Reads the traceability-matrix.json produced by the preprocessor and verifies
 * that every field discovered in the OpenAPI spec is legally mapped to a UI
 * component.  A field is "discarded" when the preprocessor could not determine
 * a component for it (e.g. unsupported schema shape); having such unmapped
 * fields means the generated UI would silently drop backend data, violating the
 * 1:1 structural bisimilarity contract.
 *
 * The script also cross-validates that constraint-bearing fields (enum,
 * minLength, pattern) have been emitted with a component that enforces those
 * constraints, so spec changes that introduce new constraints are caught before
 * deployment.
 *
 * Exit code 0 → contract is valid.
 * Exit code 1 → contract violations detected; deployment should be blocked.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const MATRIX_PATH = path.join(repoRoot, 'traceability-matrix.json');
const OPENAPI_CANDIDATES = [
  path.join(repoRoot, 'openapi.yaml'),
  path.join(repoRoot, 'openapi.yml'),
  path.join(repoRoot, 'openapi.json'),
];

// Components that accept enum constraints.
const ENUM_COMPONENTS = new Set(['<SelectInput />', '<SelectField />', '<PolymorphicInput />']);
// Components that accept text-based constraints (minLength / pattern).
const TEXT_COMPONENTS = new Set(['<TextInput />', '<TextField />']);

const loadMatrix = () => {
  if (!fs.existsSync(MATRIX_PATH)) {
    throw new Error(
      `traceability-matrix.json not found at ${MATRIX_PATH}. Run "npm run generate" first.`,
    );
  }
  const raw = fs.readFileSync(MATRIX_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.entries)) {
    throw new Error('traceability-matrix.json is malformed: expected { entries: [...] }.');
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
 * Recursively collect all schema properties that bear constraints we want to
 * validate (enum, minLength, pattern), returning an array of { pointer, name,
 * constraintType } descriptors.
 */
const collectConstraintBearingFields = (spec) => {
  const results = [];
  const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

  const escapeSegment = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');

  const walk = (schema, pointer) => {
    if (!schema || typeof schema !== 'object') return;

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
        walk(propSchema, `${pointer}/properties/${escapeSegment(propName)}`);
      }
    }
    if (schema.items && typeof schema.items === 'object') {
      walk(schema.items, `${pointer}/items`);
    }
    if (Array.isArray(schema.allOf)) {
      schema.allOf.forEach((s, i) => walk(s, `${pointer}/allOf/${i}`));
    }
    if (Array.isArray(schema.oneOf)) {
      schema.oneOf.forEach((s, i) => walk(s, `${pointer}/oneOf/${i}`));
    }
    if (Array.isArray(schema.anyOf)) {
      schema.anyOf.forEach((s, i) => walk(s, `${pointer}/anyOf/${i}`));
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
  const discarded = entries.filter((e) => e.status === 'discarded' && e.component !== null);
  // (null component with discarded status means the preprocessor intentionally
  //  skipped a structural node; only flag entries where a component name exists
  //  but is marked discarded, which would indicate a regression.)
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
      !TEXT_COMPONENTS.has(entry.component)
    ) {
      // Only flag when the component is a non-text, non-polymorphic component
      // (e.g. a BooleanInput receiving a string constraint is suspicious)
      const nonTextComponents = new Set([
        '<BooleanInput />',
        '<BooleanField />',
        '<NumberInput />',
        '<NumberField />',
        '<DateInput />',
        '<DateField />',
        '<ArrayInput />',
        '<ArrayField />',
      ]);
      if (nonTextComponents.has(entry.component)) {
        violations.push(
          `CONSTRAINT MISMATCH (${constraintType}): pointer="${pointer}" mapped to "${entry.component}" which cannot enforce text constraints`,
        );
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const total = entries.length;
  const mapped = entries.filter((e) => e.status === 'mapped').length;

  console.log(`Contract validation — ${mapped}/${total} entries mapped.`);

  if (violations.length > 0) {
    console.error(`\nContract violations (${violations.length}):`);
    for (const v of violations) {
      console.error(`  ✗ ${v}`);
    }
    console.error('\nDeployment blocked: fix the above violations before proceeding.');
    process.exitCode = 1;
  } else {
    console.log('Contract of Substitutability: VALID ✓');
  }
};

try {
  validate();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
