import type { PrecomputedInputDescriptor } from '../components/SchemaToFieldMapper';

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
 * Recursively sanitize a payload object against precomputed form nodes.
 *
 * @param payload - Raw UI form data to sanitize.
 * @param formNodes - Precomputed input descriptors from UI manifest.
 * @returns A new, sanitized payload ready for serialization and dispatch.
 */
export const adaptOutboundPayload = (
  payload: Record<string, unknown>,
  formNodes?: PrecomputedInputDescriptor[] | null,
): Record<string, unknown> => {
  // Guard: only process plain objects.
  // Non-objects (null, arrays, primitives) are not valid payload containers;
  // return an empty record so the return type is unconditionally satisfied.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    // `__schemaIndex` is internal UI state used by polymorphic selectors and
    // must never be forwarded to backend APIs.
    if (key.endsWith('__schemaIndex')) continue;

    // Strip undefined – undefined is not valid JSON and pollutes downstream payloads
    if (value === undefined) continue;

    // Find corresponding node from precomputed manifest by last path segment
    const node = formNodes?.find((n) => n.source.split('.').pop() === key);

    // Empty UI string → mathematical null (SDTM: absence of data is null, not "")
    if (value === '') {
      result[key] = null;
      continue;
    }

    // Boolean coercion based on schema declaration
    if (node?.kind === 'boolean') {
      result[key] = coerceBoolean(value);
      continue;
    }

    // Handle nested polymorphic options
    if (node?.kind === 'polymorphic' && node.options) {
      const schemaIndexRaw = payload[`${key}__schemaIndex`];
      const schemaIndex =
        schemaIndexRaw === undefined || schemaIndexRaw === null
          ? undefined
          : Number.parseInt(String(schemaIndexRaw), 10);
      const selectedOption =
        schemaIndex !== undefined && !Number.isNaN(schemaIndex)
          ? node.options[schemaIndex]
          : undefined;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && selectedOption?.node?.kind === 'object') {
        result[key] = adaptOutboundPayload(
          value as Record<string, unknown>,
          selectedOption.node.children,
        );
        continue;
      }
    }

    // Recurse into nested objects, forwarding nested schema when available
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nestedNodes = node?.kind === 'object' ? node.children : undefined;
      result[key] = adaptOutboundPayload(
        value as Record<string, unknown>,
        nestedNodes,
      );
      continue;
    }

    result[key] = value;
  }

  return result;
};
