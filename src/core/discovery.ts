export interface ResourceDefinition {
  name: string;
  hasList: boolean;
  hasCreate: boolean;
  hasShow: boolean;
  hasEdit: boolean;
  hasDelete: boolean;
  listOperationId?: string;
  createOperationId?: string;
  showOperationId?: string;
  editOperationId?: string;
  deleteOperationId?: string;
  listResponseSchema?: any;
  showResponseSchema?: any;
  createRequestBodySchema?: any;
  editRequestBodySchema?: any;
  listQueryParams?: string[];
}

const resolveResourceName = (path: string, pathItem: any, methods: string[]): string | null => {
  // Check for tags first across available methods
  for (const method of methods) {
    if (pathItem[method]?.tags && pathItem[method].tags.length > 0) {
      return pathItem[method].tags[0]; // Prioritize first tag
    }
  }

  // Fallback to first path segment
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const rootPath = segments[0];
  // Ignore purely structural root paths if needed (e.g. mdr, v1, api)
  // For duckdeploy, if it has no tags, maybe the first path segment is reasonable.
  // We can filter out common non-resource roots or let them pass.

  return rootPath;
}

export const discoverResources = (spec: any): ResourceDefinition[] => {
  if (!spec || !spec.paths) return [];

  const resourceMap: Record<string, ResourceDefinition> = {};

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    const methods = Object.keys(pathItem).filter(k =>
      ['get', 'post', 'put', 'patch', 'delete'].includes(k.toLowerCase())
    );

    const resourceName = resolveResourceName(path, pathItem, methods);

    // Ignore root endpoints with no name
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

    // Determine capabilities based on path structure and methods
    const isInstancePath = path.includes('{') && path.endsWith('}');
    // If it ends with ID parameter, it's an instance path (e.g. /users/{id})

    for (const method of methods) {
      const operation = (pathItem as any)[method];
      if (!operation) continue;

      const operationId = operation.operationId;

      // Determine response schemas for list and show
      const getResponseSchema = () => {
        const okResponse = operation.responses?.['200'] || operation.responses?.['201'];
        return okResponse?.content?.['application/json']?.schema || null;
      };

      const getRequestBodySchema = () => {
        return operation.requestBody?.content?.['application/json']?.schema || null;
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
          res.showOperationId = operationId;
          res.showResponseSchema = getResponseSchema();
        } else {
          res.hasList = true;
          res.listOperationId = operationId;
          res.listResponseSchema = getResponseSchema();
          res.listQueryParams = getQueryParams();
        }
      } else if (method === 'post' && !isInstancePath) {
        res.hasCreate = true;
        res.createOperationId = operationId;
        res.createRequestBodySchema = getRequestBodySchema();
      } else if ((method === 'put' || method === 'patch') && isInstancePath) {
        res.hasEdit = true;
        res.editOperationId = operationId;
        res.editRequestBodySchema = getRequestBodySchema();
      } else if (method === 'delete' && isInstancePath) {
        res.hasDelete = true;
        res.deleteOperationId = operationId;
      }
    }
  }

  return Object.values(resourceMap);
};
