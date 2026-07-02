import { normalizeProviderError, NormalizedHttpError } from "../api/custom-instance";
import { type AxiosError } from 'axios';
import { type DataProvider, type GetListParams, type GetListResult } from 'react-admin';
import { AXIOS_INSTANCE } from '../api/custom-instance';
import type { ResourceDefinition } from '../core/discovery';
import { adaptOutboundPayload } from './outboundAdapter';

let resourceMap: Record<string, ResourceDefinition> = {};
let operationFunctionMap: Record<string, { functionName: string; modulePath: string }> = {};
const ORVAL_FACTORY_EXPORT_NAME = /^get[A-Z]/;

const generatedModules = import.meta.glob([
  '../api/generated/*/*.ts',
  '!../api/generated/model/*'
]) as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

const apiFunctionsCache: Record<string, Record<string, unknown>> = {};

const ensureModuleLoaded = async (modulePath: string): Promise<Record<string, unknown>> => {
  if (apiFunctionsCache[modulePath]) {
    return apiFunctionsCache[modulePath];
  }

  const loader = generatedModules[modulePath];
  if (!loader) {
    throw new Error(`Generated API module not found at "${modulePath}".`);
  }

  const moduleExports = await loader();
  const flattenedExports: Record<string, unknown> = {};

  for (const [exportName, exportedValue] of Object.entries(moduleExports)) {
    flattenedExports[exportName] = exportedValue;

    // Orval's axios + tags-split output exports `get<Tag>()` factories that return
    // objects containing the actual per-operation functions. Flatten them so the
    // precomputed manifest map can resolve directly to callable functions.
    if (typeof exportedValue === 'function' && ORVAL_FACTORY_EXPORT_NAME.test(exportName)) {
      try {
        const groupedFunctions = (exportedValue as () => unknown)();
        if (groupedFunctions && typeof groupedFunctions === 'object') {
          for (const [groupedName, groupedFunction] of Object.entries(groupedFunctions)) {
            if (typeof groupedFunction === 'function') {
              flattenedExports[groupedName] = groupedFunction;
            }
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(`Failed to inspect generated API export "${exportName}" in "${modulePath}".`, error);
        }
      }
    }
  }

  apiFunctionsCache[modulePath] = flattenedExports;
  return flattenedExports;
};



/**
 * Generated description.
 *
 */
export const getNormalizedErrorStatus = (error: unknown): number | undefined => {
  const normalizedError = normalizeProviderError(error);
  if (normalizedError instanceof NormalizedHttpError || (normalizedError instanceof Error && normalizedError.name === "HttpError")) {
    return (normalizedError as any).status;
  }
  return undefined;
};


/**
 * Generated description.
 *
 */
export const setResourceDefinitions = (
  resources: ResourceDefinition[],
  operationMappings: Record<string, { functionName: string; modulePath: string }> = {},
) => {
  resourceMap = resources.reduce((acc, resourceDefinition) => {
    acc[resourceDefinition.name] = resourceDefinition;
    return acc;
  }, {} as Record<string, ResourceDefinition>);
  operationFunctionMap = operationMappings;
};

const callApiFunction = async (operationKey: string | undefined, ...args: unknown[]) => {
  if (!operationKey) {
    throw new Error('Operation not supported for this resource.');
  }

  const mapping = operationFunctionMap[operationKey];
  if (!mapping) {
    throw new Error(
      `Generated API function mapping for operation "${operationKey}" not found. ` +
        'Ensure ui-manifest.json is up to date (run npm run generate).',
    );
  }

  const { functionName, modulePath } = mapping;
  const moduleFunctions = await ensureModuleLoaded(modulePath);
  const fn = moduleFunctions[functionName];

  if (typeof fn === 'function') {
    return await (fn as (...fnArgs: unknown[]) => Promise<unknown>)(...args);
  }

  throw new Error(
    `Generated API function "${functionName}" in module "${modulePath}" for operation "${operationKey}" not found.`,
  );
};

const transformResponse = (response: unknown, resourceDefinition: ResourceDefinition): { data: unknown; total?: number } => {
  const isObject = typeof response === 'object' && response !== null;
  const payload = isObject && 'data' in (response as Record<string, unknown>)
    ? (response as Record<string, unknown>).data
    : response;

  let data: unknown = payload;

  const halKey = resourceDefinition.xHalEmbedded;
  const collectionKey = resourceDefinition.xDataCollection;

  const resolvePath = (obj: any, path: string) => {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  };

  if (halKey && data && typeof data === 'object') {
    const embedded = resolvePath(data, '_embedded');
    if (embedded && typeof embedded === 'object' && halKey in embedded) {
      data = embedded[halKey];
    }
  } else if (collectionKey && data && typeof data === 'object') {
    const resolvedData = resolvePath(data, collectionKey);
    if (resolvedData !== undefined) {
      data = resolvedData;
    }
  }

  let total: number | undefined;

  const totalPath = resourceDefinition.xPaginationTotal;
  if (totalPath && payload && typeof payload === 'object') {
    const resolvedTotal = resolvePath(payload, totalPath);
    if (typeof resolvedTotal === 'number') {
      total = resolvedTotal;
    }
  }

  if (total === undefined && Array.isArray(data)) {
    total = data.length;
  }

  return { data, total };
};

const buildListQueryParams = (resourceDefinition: ResourceDefinition, params: GetListParams): Record<string, unknown> => {
  const query: Record<string, unknown> = { ...(params.filter || {}) };
  const knownQueryParams = new Set(resourceDefinition.listQueryParams || []);

  const setQuery = (key: string | undefined, value: unknown) => {
    if (!key || value === undefined) return;
    query[key] = value;
  };

  const hasParam = (candidate: string) => knownQueryParams.has(candidate) ? candidate : undefined;

  if (params.pagination) {
    const page = params.pagination.page;
    const perPage = params.pagination.perPage;

    if (hasParam('page')) setQuery('page', page);
    else if (hasParam('pageNumber')) setQuery('pageNumber', page);
    else if (hasParam('pageIndex')) setQuery('pageIndex', page);

    if (hasParam('perPage')) setQuery('perPage', perPage);
    else if (hasParam('pageSize')) setQuery('pageSize', perPage);
    else if (hasParam('limit')) setQuery('limit', perPage);
    else if (hasParam('size')) setQuery('size', perPage);
    else if (hasParam('top')) setQuery('top', perPage);

    if (hasParam('offset')) setQuery('offset', (page - 1) * perPage);
    else if (hasParam('skip')) setQuery('skip', (page - 1) * perPage);
    else if (hasParam('start')) setQuery('start', (page - 1) * perPage);
  }

  if (params.sort) {
    const sortField = params.sort.field;
    const sortOrder = String(params.sort.order || '').toLowerCase();
    const sortDirection = sortOrder === 'desc' ? 'desc' : 'asc';

    if (hasParam('sort')) setQuery('sort', `${sortField},${sortDirection}`);
    else {
      if (hasParam('sortBy')) setQuery('sortBy', sortField);
      else if (hasParam('orderby')) setQuery('orderby', sortField);
      else if (hasParam('orderBy')) setQuery('orderBy', sortField);

      if (hasParam('order')) setQuery('order', sortDirection);
      else if (hasParam('sortOrder')) setQuery('sortOrder', sortDirection);
      else if (hasParam('direction')) setQuery('direction', sortDirection);
    }
  }

  if (params.meta?.query && typeof params.meta.query === 'object') {
    Object.assign(query, params.meta.query);
  }

  return Object.fromEntries(Object.entries(query).filter(([key]) => knownQueryParams.has(key)));
};

const ensureRecordId = (record: unknown, resourceDefinition: ResourceDefinition, fallbackId: unknown) => {
  if (!record || typeof record !== 'object') {
    return { id: fallbackId };
  }

  const typedRecord = record as Record<string, unknown>;
  const explicitIdKey = resourceDefinition.xRecordId;
  const idValue = explicitIdKey && explicitIdKey in typedRecord ? typedRecord[explicitIdKey] : typedRecord.id;

  return {
    ...typedRecord,
    id: idValue ?? fallbackId,
  };
};

export const openApiDataProvider: DataProvider = {
  getList: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const queryParams = buildListQueryParams(resourceDefinition, params);
    const response = await callApiFunction(resourceDefinition.listOperationId, queryParams);
    const transformed = transformResponse(response, resourceDefinition);
    const rows = Array.isArray(transformed.data) ? transformed.data : [];

    return {
      data: rows.map((item, index) => ensureRecordId(item, resourceDefinition, index)),
      total: transformed.total ?? rows.length,
    } as GetListResult;
  },

  getOne: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const response = await callApiFunction(resourceDefinition.showOperationId, String(params.id));
    const transformed = transformResponse(response, resourceDefinition);

    return { data: ensureRecordId(transformed.data, resourceDefinition, params.id) };
  },

  getMany: async (resource, params) => {
    const data = await Promise.all(
      params.ids.map((id) => openApiDataProvider.getOne(resource, { id }).then((response) => response.data)),
    );
    return { data };
  },

  getManyReference: async (resource, params) =>
    openApiDataProvider.getList(resource, {
      ...params,
      filter: { ...params.filter, [params.target]: params.id },
    }),

  update: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const outboundData = adaptOutboundPayload(params.data, resourceDefinition.editRequestBodySchema);
    const response = await callApiFunction(resourceDefinition.editOperationId, String(params.id), outboundData);
    const transformed = transformResponse(response, resourceDefinition);

    return { data: ensureRecordId(transformed.data ?? outboundData, resourceDefinition, params.id) };
  },

  updateMany: async (resource, params) => {
    const records = await Promise.all(
      params.ids.map((id) =>
        openApiDataProvider
          .update(resource, { id, data: params.data, previousData: {} as any })
          .then((response) => response.data),
      ),
    );
    return { data: records.map((record) => (record as Record<string, unknown>).id as string | number) };
  },

  create: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const outboundData = adaptOutboundPayload(params.data, resourceDefinition.createRequestBodySchema);
    const response = await callApiFunction(resourceDefinition.createOperationId, outboundData);
    const transformed = transformResponse(response, resourceDefinition);
    const payload = transformed.data ?? outboundData;

    return { data: ensureRecordId(payload, resourceDefinition, (params.data as Record<string, unknown>).id ?? null) };
  },

  delete: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const response = await callApiFunction(resourceDefinition.deleteOperationId, String(params.id));
    const transformed = transformResponse(response, resourceDefinition);
    return { data: transformed.data ?? params.previousData };
  },

  deleteMany: async (resource, params) => {
    await Promise.all(params.ids.map((id) => openApiDataProvider.delete(resource, { id, previousData: {} as any })));
    return { data: params.ids };
  },
};
