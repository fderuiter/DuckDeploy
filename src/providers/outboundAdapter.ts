import type { OpenAPIV3 } from 'openapi-types';

/**
 * Outbound Adapter – sanitizes UI payloads before dispatch via Orval/Axios.
 *
 * Responsibilities (SDTM / CDASH constraints):
 *  1. Convert empty UI strings → null  (eliminates data pollution / entropy)
 *  2. Coerce boolean fields declared in the OpenAPI schema (string "true"/"false" → actual boolean)
 *  3. Strip `undefined` properties to produce deterministic, schema-conformant structures
 */

/**
 * String representations of `true` / `false` accepted for boolean coercion.
 * Follows common CDASH conventions: "Y"/"N" shorthand is included alongside
 * the more common "true"/"false" and numeric "1"/"0" forms.
 */
const BOOLEAN_TRUE_STRINGS = new Set(['true', '1', 'y', 'yes']);
const BOOLEAN_FALSE_STRINGS = new Set(['false', '0', 'n', 'no']);

/**
 * Coerce a single value to a boolean according to CDASH conventions.
 * Returns null when the value is absent or unrecognizable.
 * Emits a console warning when a non-null, non-undefined value cannot be
 * coerced, so developers can trace unexpected inputs during development.
 */
const coerceBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (BOOLEAN_TRUE_STRINGS.has(lower)) return true;
    if (BOOLEAN_FALSE_STRINGS.has(lower)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  console.warn(
    `[outboundAdapter] Unable to coerce value to boolean; falling back to null. Value:`,
    value,
  );
  return null;
};

/**
 * Recursively sanitize a payload object against an optional OpenAPI schema.
 *
 * @param payload - Raw UI form data to sanitize.
 * @param schema  - OpenAPI SchemaObject for type-aware coercion (optional).
 * @returns A new, sanitized payload ready for serialization and dispatch.
 */
/**
 * Type guard to distinguish a resolved SchemaObject from a ReferenceObject.
 * `$ref` properties are not dereferenced at runtime; we skip them for coercion.
 */
const isSchemaObject = (
  obj: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
): obj is OpenAPIV3.SchemaObject =>
  typeof obj === 'object' && obj !== null && !('$ref' in obj);

export const adaptOutboundPayload = (
  payload: Record<string, unknown>,
  schema?: OpenAPIV3.SchemaObject | null,
): Record<string, unknown> => {
  // Guard: only process plain objects.
  // Non-objects (null, arrays, primitives) are not valid payload containers;
  // return an empty record so the return type is unconditionally satisfied.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const properties = schema?.properties;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    // `__schemaIndex` is internal UI state used by polymorphic selectors and
    // must never be forwarded to backend APIs.
    if (key.endsWith('__schemaIndex')) continue;

    // Strip undefined – undefined is not valid JSON and pollutes downstream payloads
    if (value === undefined) continue;

    const rawFieldSchema = properties?.[key];
    // Only use the schema entry if it is a fully resolved SchemaObject;
    // unresolved $ref objects cannot be introspected for type information.
    const fieldSchema = isSchemaObject(rawFieldSchema) ? rawFieldSchema : undefined;

    // Empty UI string → mathematical null (SDTM: absence of data is null, not "")
    if (value === '') {
      result[key] = null;
      continue;
    }

    // Boolean coercion based on schema declaration
    if (fieldSchema?.type === 'boolean') {
      result[key] = coerceBoolean(value);
      continue;
    }

    // Recurse into nested objects, forwarding nested schema when available
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nestedSchema =
        fieldSchema?.type === 'object' ? fieldSchema : undefined;
      result[key] = adaptOutboundPayload(
        value as Record<string, unknown>,
        nestedSchema,
      );
      continue;
    }

    result[key] = value;
  }

  return result;
};
