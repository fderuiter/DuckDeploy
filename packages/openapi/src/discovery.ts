import { getSchemaFromContent } from './schema.ts';
import type { ResourceDefinition } from '../../../src/core/discovery.ts';
import { HTTP_METHODS } from '../../../src/core/discovery.ts';

export const resolveResourceName = (path: string, pathItem: any, methods: string[]): string | null => {
  for (const method of methods) {
    if (pathItem[method]?.tags && pathItem[method].tags.length > 0) {
      return pathItem[method].tags[0];
    }
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return segments[0];
};

export const discoverResources = (spec: any): ResourceDefinition[] => {
  if (!spec || !spec.paths) return [];

  const resourceMap: Record<string, ResourceDefinition> = {};

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    const methods = Object.keys(pathItem).filter(k =>
      HTTP_METHODS.has(k.toLowerCase())
    );

    const resourceName = resolveResourceName(path, pathItem, methods);

    if (!resourceName) continue;

    if (!resourceMap[resourceName]) {
      resourceMap[resourceName] = {
        name: resourceName,
        hasList: false,
        hasCreate: false,
        hasShow: false,
        hasEdit: false,
        hasDelete: false,
        listQueryParams: [],
      };
    }

    const res = resourceMap[resourceName];

    const isInstancePath = path.includes('{') && path.endsWith('}');

    for (const method of methods) {
      const operation = (pathItem as any)[method];
      if (!operation) continue;

      const operationId = operation.operationId;
      const operationKey =
        typeof operationId === 'string' && operationId.trim().length > 0
          ? operationId
          : `${method.toUpperCase()} ${path}`;

      const getResponseSchema = () => {
        const okResponse = operation.responses?.['200'] || operation.responses?.['201'];
        return okResponse?.content ? getSchemaFromContent(okResponse.content) : null;
      };

      const getRequestBodySchema = () => {
        return operation.requestBody?.content ? getSchemaFromContent(operation.requestBody.content) : null;
      };

      const getQueryParams = (): string[] => {
        if (!Array.isArray(operation.parameters)) return [];
        return operation.parameters
          .filter((parameter: any) => parameter && parameter.in === 'query' && typeof parameter.name === 'string')
          .map((parameter: any) => parameter.name);
      };

      if (method === 'get') {
        if (isInstancePath) {
          res.hasShow = true;
          res.showPath = path;
          res.showOperationId = operationKey;
          res.showResponseSchema = getResponseSchema();
        } else {
          res.hasList = true;
          res.listPath = path;
          res.listOperationId = operationKey;
          res.listResponseSchema = getResponseSchema();
          res.listQueryParams = getQueryParams();
        }
      } else if (method === 'post' && !isInstancePath) {
        res.hasCreate = true;
        res.createPath = path;
        res.createOperationId = operationKey;
        res.createRequestBodySchema = getRequestBodySchema();
      } else if ((method === 'put' || method === 'patch') && isInstancePath) {
        res.hasEdit = true;
        res.editPath = path;
        res.editMethod = method as 'put' | 'patch';
        res.editOperationId = operationKey;
        res.editRequestBodySchema = getRequestBodySchema();
      } else if (method === 'delete' && isInstancePath) {
        res.hasDelete = true;
        res.deletePath = path;
        res.deleteOperationId = operationKey;
      }
    }
  }

  return Object.values(resourceMap);
};
