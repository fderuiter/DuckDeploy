import type { DataProvider, GetListParams, GetListResult } from 'react-admin';
import type { ResourceDefinition } from '../core/discovery';
import { adaptOutboundPayload } from './outboundAdapter';

let resourceMap: Record<string, ResourceDefinition> = {};
let operationFunctionMap: Record<string, string> = {};

const generatedModules = import.meta.glob('../api/generated/**/*.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

const apiFunctions = Object.entries(generatedModules).reduce<Record<string, unknown>>((acc, [path, moduleExports]) => {
  if (path.includes('/model/')) {
    return acc;
  }

  for (const [exportName, exportedValue] of Object.entries(moduleExports)) {
    acc[exportName] = exportedValue;

    if (typeof exportedValue === 'function' && exportedValue.length === 0 && /^get[A-Z]/.test(exportName)) {
      try {
        const groupedFunctions = (exportedValue as () => unknown)();
        if (groupedFunctions && typeof groupedFunctions === 'object') {
          for (const [groupedName, groupedFunction] of Object.entries(groupedFunctions)) {
            if (typeof groupedFunction === 'function') {
              acc[groupedName] = groupedFunction;
            }
          }
        }
      } catch {
        // Ignore non-factory exports.
      }
    }
  }

  return acc;
}, {});

export const setResourceDefinitions = (
  resources: ResourceDefinition[],
  operationMappings: Record<string, string> = {},
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

  const functionName = operationFunctionMap[operationKey];
  if (!functionName) {
    throw new Error(`Generated API function mapping for operation "${operationKey}" not found.`);
  }

  const fn = apiFunctions[functionName];
  if (typeof fn === 'function') {
    return await (fn as (...fnArgs: unknown[]) => Promise<unknown>)(...args);
  }

  throw new Error(
    `Generated API function "${functionName}" for operation "${operationKey}" not found.`,
  );
};

const transformResponse = (response: unknown): { data: unknown; total?: number } => {
  const isObject = typeof response === 'object' && response !== null;
  const payload = isObject && 'data' in (response as Record<string, unknown>)
    ? (response as Record<string, unknown>).data
    : response;

  let data: unknown = payload;

  if (data && typeof data === 'object' && '_embedded' in (data as Record<string, unknown>)) {
    const embedded = (data as Record<string, unknown>)._embedded as Record<string, unknown> | undefined;
    if (embedded) {
      const firstKey = Object.keys(embedded)[0];
      if (firstKey) {
        data = embedded[firstKey];
      }
    }
  } else if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).items)) {
    data = (data as Record<string, unknown>).items;
  }

  let total: number | undefined;
  const headers =
    isObject && 'headers' in (response as Record<string, unknown>)
      ? ((response as Record<string, unknown>).headers as Record<string, string | undefined>)
      : undefined;

  if (headers) {
    const customTotalHeader =
      typeof import.meta.env.VITE_TOTAL_COUNT_HEADER === 'string'
        ? import.meta.env.VITE_TOTAL_COUNT_HEADER.toLowerCase()
        : undefined;

    const totalHeaderValue =
      headers['x-total-count'] ||
      headers['content-range'] ||
      (customTotalHeader ? headers[customTotalHeader] : undefined);

    if (typeof totalHeaderValue === 'string') {
      total = totalHeaderValue.includes('/')
        ? Number.parseInt(totalHeaderValue.split('/').pop() || '0', 10)
        : Number.parseInt(totalHeaderValue, 10);
    }
  }

  if (total === undefined && payload && typeof payload === 'object') {
    const source = payload as Record<string, unknown>;
    const maybeTotal = source.total ?? source.count ?? source.totalCount;
    if (typeof maybeTotal === 'number') {
      total = maybeTotal;
    } else if (
      source.page &&
      typeof source.page === 'object' &&
      typeof (source.page as Record<string, unknown>).totalElements === 'number'
    ) {
      total = (source.page as Record<string, unknown>).totalElements as number;
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
  const queryIsOpen = knownQueryParams.size === 0;
  const hasParam = (...candidates: string[]) => candidates.find((candidate) => queryIsOpen || knownQueryParams.has(candidate));

  const setQuery = (key: string | undefined, value: unknown) => {
    if (!key || value === undefined) return;
    query[key] = value;
  };

  if (params.pagination) {
    const page = params.pagination.page;
    const perPage = params.pagination.perPage;

    setQuery(hasParam('page', 'pageNumber', 'pageIndex'), page);
    setQuery(hasParam('perPage', 'pageSize', 'limit', 'size', 'top'), perPage);
    setQuery(hasParam('offset', 'skip', 'start'), (page - 1) * perPage);
  }

  if (params.sort) {
    const sortField = params.sort.field;
    const sortOrder = String(params.sort.order || '').toLowerCase();
    const sortDirection = sortOrder === 'desc' ? 'desc' : 'asc';

    setQuery(hasParam('sort'), `${sortField},${sortDirection}`);
    setQuery(hasParam('sortBy', 'orderby', 'orderBy'), sortField);
    setQuery(hasParam('order', 'sortOrder', 'direction'), sortDirection);
  }

  if (params.meta?.query && typeof params.meta.query === 'object') {
    Object.assign(query, params.meta.query);
  }

  if (!queryIsOpen) {
    return Object.fromEntries(Object.entries(query).filter(([key]) => knownQueryParams.has(key)));
  }

  return query;
};

const ensureRecordId = (record: unknown, fallbackId: unknown) => {
  if (!record || typeof record !== 'object') {
    return { id: fallbackId };
  }

  const typedRecord = record as Record<string, unknown>;
  return {
    ...typedRecord,
    id: typedRecord.id ?? typedRecord._id ?? typedRecord.uuid ?? fallbackId,
  };
};

export const openApiDataProvider: DataProvider = {
  getList: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const queryParams = buildListQueryParams(resourceDefinition, params);
    const response = await callApiFunction(resourceDefinition.listOperationId, queryParams);
    const transformed = transformResponse(response);
    const rows = Array.isArray(transformed.data) ? transformed.data : [];

    return {
      data: rows.map((item, index) => ensureRecordId(item, index)),
      total: transformed.total ?? rows.length,
    } as GetListResult;
  },

  getOne: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const response = await callApiFunction(resourceDefinition.showOperationId, String(params.id));
    const transformed = transformResponse(response);

    return { data: ensureRecordId(transformed.data, params.id) };
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
    const transformed = transformResponse(response);

    return { data: ensureRecordId(transformed.data ?? outboundData, params.id) };
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
    const transformed = transformResponse(response);
    const payload = transformed.data ?? outboundData;

    return { data: ensureRecordId(payload, (params.data as Record<string, unknown>).id ?? null) };
  },

  delete: async (resource, params) => {
    const resourceDefinition = resourceMap[resource];
    if (!resourceDefinition) throw new Error(`Unknown resource ${resource}`);

    const response = await callApiFunction(resourceDefinition.deleteOperationId, String(params.id));
    const transformed = transformResponse(response);
    return { data: transformed.data ?? params.previousData };
  },

  deleteMany: async (resource, params) => {
    await Promise.all(params.ids.map((id) => openApiDataProvider.delete(resource, { id, previousData: {} as any })));
    return { data: params.ids };
  },
};
