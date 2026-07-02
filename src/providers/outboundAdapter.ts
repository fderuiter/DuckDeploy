import type { OpenAPIV3 } from 'openapi-types';

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

  // Schema-based transformations have been moved upstream to the field level via SchemaLifecycleWrapper.
  // This ensures the form state is always in sync with the payload expected by the API.
  return payload;
};
