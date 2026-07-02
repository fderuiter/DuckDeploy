import type { OpenAPIV3 } from 'openapi-types';
import { UnifiedSchemaWalker } from '@duckdeploy/openapi';

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

  if (!schema) {
    return payload;
  }

  const walker = new UnifiedSchemaWalker(
    {
      visitNode: (context, defaultVisit) => defaultVisit(),
    },
    { walkPayload: true }
  );

  const result = walker.walk(schema, payload);
  return (result && typeof result === 'object' && !Array.isArray(result)) ? result : {};
};
