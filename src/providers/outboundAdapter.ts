import type { OpenAPIV3 } from 'openapi-types';
import { UnifiedSchemaWalker, SCHEMA_SELECTION_KEY } from '@duckdeploy/openapi';

/**
 * Outbound Adapter – sanitizes UI payloads before dispatch via Orval/Axios.
 */
export const adaptOutboundPayload = (
  payload: Record<string, unknown>,
  schema?: OpenAPIV3.SchemaObject | null,
): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const walker = new UnifiedSchemaWalker(
    {
      visitNode: (context, defaultVisit) => defaultVisit(),
    },
    { walkPayload: true }
  );

  // If there's no schema, we still want to strip out `SCHEMA_SELECTION_KEY` and undefined values.
  // The Walker requires a schema to function correctly with properties. 
  // Wait, if no schema is provided, we should probably fall back to a basic traversal or create a dummy schema.
  if (!schema) {
    const stripMetadata = (obj: any): any => {
      if (Array.isArray(obj)) return obj.map(stripMetadata);
      if (obj !== null && typeof obj === 'object') {
        const res: any = {};
        for (const [k, v] of Object.entries(obj)) {
          if (k.endsWith(SCHEMA_SELECTION_KEY) || v === undefined) continue;
          if (v === '') {
            res[k] = null;
          } else {
            res[k] = stripMetadata(v);
          }
        }
        return res;
      }
      return obj;
    };
    return stripMetadata(payload);
  }

  const result = walker.walk(schema, payload);
  return (result && typeof result === 'object' && !Array.isArray(result)) ? result : {};
};
