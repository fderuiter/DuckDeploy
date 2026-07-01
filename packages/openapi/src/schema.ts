import $RefParser from '@apidevtools/json-schema-ref-parser';
import { injectOriginRefs } from './normalization.ts';
import { FULL_HTTP_METHODS } from '../../../src/core/discovery.ts';

/**
 * Generated description.
 *
 */
export const toOperationId = (method: string, route: string): string => {
  const routePart = route
    .replace(/^\/+/, '')
    .replace(/\{([^}]+)\}/g, 'By-$1')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'root';

  return `${method.toLowerCase()}-${routePart}`;
};

/**
 * Generated description.
 *
 */
export const pickPreferredMediaType = (content: any): any => {
  if (!content || typeof content !== 'object') return content;

  if (content['application/json']) {
    return { 'application/json': content['application/json'] };
  }

  const [firstType] = Object.keys(content);
  return firstType ? { [firstType]: content[firstType] } : content;
};

/**
 * Generated description.
 *
 */
export const optimizeOperation = (route: string, method: string, operation: any): void => {
  if (!operation || typeof operation !== 'object') return;

  if (!operation.operationId || typeof operation.operationId !== 'string') {
    operation.operationId = toOperationId(method, route);
  }

  if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
    const fallbackTag = route.split('/').filter(Boolean)[0] ?? 'default';
    operation.tags = [fallbackTag];
  }

  if (operation.requestBody?.content) {
    operation.requestBody.content = pickPreferredMediaType(operation.requestBody.content);
  }

  if (operation.responses && typeof operation.responses === 'object') {
    for (const response of Object.values(operation.responses) as any[]) {
      if (response && typeof response === 'object' && response.content) {
        response.content = pickPreferredMediaType(response.content);
      }
    }
  }
};

/**
 * Generated description.
 *
 */
export const stripNoise = (node: any): void => {
  if (Array.isArray(node)) {
    for (const item of node) {
      stripNoise(item);
    }
    return;
  }

  if (!node || typeof node !== 'object') {
    return;
  }

  delete node.example;
  delete node.examples;

  for (const value of Object.values(node)) {
    stripNoise(value);
  }
};

/**
 * Generated description.
 *
 */
export const sortKeysDeep = (node: any): any => {
  if (Array.isArray(node)) {
    return node.map(sortKeysDeep);
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  const sorted: any = {};
  for (const key of Object.keys(node).sort()) {
    sorted[key] = sortKeysDeep(node[key]);
  }

  return sorted;
};

/**
 * Generated description.
 *
 */
export const compileSpec = async (parsed: any): Promise<any> => {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid OpenAPI document: expected an object at root.');
  }

  // Inject origin refs before dereferencing so we can resolve discriminators later
  injectOriginRefs(parsed);

  const dereferenced = await $RefParser.dereference(parsed, {
    dereference: {
      circular: 'ignore',
    },
    mutateInputSchema: false,
  });

  if (dereferenced.paths && typeof dereferenced.paths === 'object') {
    for (const [route, pathItem] of Object.entries(dereferenced.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const [method, operation] of Object.entries(pathItem)) {
        if (!FULL_HTTP_METHODS.has(method.toLowerCase())) continue;
        optimizeOperation(route, method, operation);
      }
    }
  }

  stripNoise(dereferenced);
  return sortKeysDeep(dereferenced);
};

/**
 * Generated description.
 *
 */
export const getSchemaFromContent = (content: any): any => {
  if (!content || typeof content !== 'object') return null;
  if (content['application/json']?.schema) return content['application/json'].schema;
  const firstMedia = Object.values(content)[0] as any;
  if (firstMedia && typeof firstMedia === 'object' && 'schema' in firstMedia) {
    return firstMedia.schema;
  }
  return null;
};
