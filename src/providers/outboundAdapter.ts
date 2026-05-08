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
 * Coerce a single value to a boolean according to CDASH conventions.
 * Returns null when the value is absent or unrecognisable rather than
 * propagating an ambiguous truthy/falsy coercion.
 */
const coerceBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'y' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'n' || lower === 'no') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return null;
};

/**
 * Recursively sanitize a payload object against an optional OpenAPI schema.
 *
 * @param payload - Raw UI form data to sanitize.
 * @param schema  - OpenAPI SchemaObject for type-aware coercion (optional).
 * @returns A new, sanitized payload ready for serialization and dispatch.
 */
export const adaptOutboundPayload = (
  payload: Record<string, unknown>,
  schema?: OpenAPIV3.SchemaObject | null,
): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const properties = schema?.properties as
    | Record<string, OpenAPIV3.SchemaObject>
    | undefined;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    // Strip undefined – undefined is not valid JSON and pollutes downstream payloads
    if (value === undefined) continue;

    const fieldSchema = properties?.[key];

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
