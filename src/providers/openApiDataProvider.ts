import { isAxiosError, type AxiosError } from 'axios';
import { HttpError, type DataProvider, type GetListParams, type GetListResult } from 'react-admin';
import { AXIOS_INSTANCE } from '../api/custom-instance';
import type { ResourceDefinition } from '../core/discovery';
import { adaptOutboundPayload } from './outboundAdapter';

let resourceMap: Record<string, ResourceDefinition> = {};
let operationFunctionMap: Record<string, string> = {};
const ORVAL_FACTORY_EXPORT_NAME = /^get[A-Z]/;

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

    // Orval's axios + tags-split output exports `get<Tag>()` factories that return
    // objects containing the actual per-operation functions. Flatten them so the
    // precomputed manifest map can resolve directly to callable functions.
    if (typeof exportedValue === 'function' && ORVAL_FACTORY_EXPORT_NAME.test(exportName)) {
      try {
        const groupedFunctions = (exportedValue as () => unknown)();
        if (groupedFunctions && typeof groupedFunctions === 'object') {
          for (const [groupedName, groupedFunction] of Object.entries(groupedFunctions)) {
            if (typeof groupedFunction === 'function') {
              acc[groupedName] = groupedFunction;
            }
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(`Failed to inspect generated API export "${exportName}".`, error);
        }
      }
    }
  }

  return acc;
}, {});

const extractErrorMessage = (payload: unknown): string | undefined => {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const message = extractErrorMessage(entry);
      if (message) {
        return message;
      }
    }
    return undefined;
  }

  if (typeof payload === 'object') {
    const source = payload as Record<string, unknown>;
    for (const candidate of ['message', 'detail', 'title', 'error', 'error_description']) {
      const value = source[candidate];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  }

  return undefined;
};

const extractErrorCode = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const source = payload as Record<string, unknown>;
  for (const candidate of ['code', 'errorCode', 'type', 'reason']) {
    const value = source[candidate];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
};

const AUTH_HINT_PATTERN =
  /\b(unauthori[sz]ed|authentication required|not authenticated|invalid token|token expired|missing credentials)\b/i;
const FORBIDDEN_HINT_PATTERN = /\b(forbidden|insufficient permissions?|not allowed|access denied)\b/i;

const getHeaderValue = (headers: unknown, headerName: string): string | undefined => {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const normalizedHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== normalizedHeaderName) {
      continue;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      const firstString = value.find((entry): entry is string => typeof entry === 'string');
      if (firstString) {
        return firstString;
      }
    }
  }

  return undefined;
};

const normalizeErrorStatus = (status: number, message: string, responseData: unknown, responseHeaders: unknown): number => {
  if (status === 401 || status === 403) {
    return status;
  }

  if (status !== 404 && (status < 500 || status > 599)) {
    return status;
  }

  const errorCode = extractErrorCode(responseData);
  const hasWwwAuthenticateHeader = typeof getHeaderValue(responseHeaders, 'www-authenticate') === 'string';
  const hasAuthHint =
    AUTH_HINT_PATTERN.test(message) ||
    (typeof errorCode === 'string' && AUTH_HINT_PATTERN.test(errorCode)) ||
    hasWwwAuthenticateHeader;

  if (!hasAuthHint) {
    return status;
  }

  const isForbiddenHint =
    FORBIDDEN_HINT_PATTERN.test(message) ||
    (typeof errorCode === 'string' && FORBIDDEN_HINT_PATTERN.test(errorCode));

  return isForbiddenHint ? 403 : 401;
};

const dispatchNormalizedAuthViolation = (error: AxiosError, status: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  const requestConfig = error?.response?.config ?? error?.config;
  const event = new CustomEvent('duckdeploy:auth_violation', {
    detail: {
      method: requestConfig?.method?.toUpperCase(),
      url: requestConfig?.url,
      status,
    },
  });
  window.dispatchEvent(event);
};

const normalizeProviderError = (error: unknown): unknown => {
  if (error instanceof HttpError) {
    return error;
  }

  if (!isAxiosError(error)) {
    return error;
  }

  const status = typeof error.response?.status === 'number' ? error.response.status : 0;
  const responseData = error.response?.data;
  const message =
    extractErrorMessage(responseData) ??
    error.message ??
    'An unexpected error occurred while communicating with the API.';
  const normalizedStatus = normalizeErrorStatus(status, message, responseData, error.response?.headers);

  if ((normalizedStatus === 401 || normalizedStatus === 403) && normalizedStatus !== status) {
    dispatchNormalizedAuthViolation(error, normalizedStatus);
  }

  const body =
    responseData && typeof responseData === 'object' && !Array.isArray(responseData)
      ? {
        ...(responseData as Record<string, unknown>),
        message,
        _normalizedStatus: normalizedStatus,
        _originalStatus: status,
      }
      : { message, detail: responseData ?? null, _normalizedStatus: normalizedStatus, _originalStatus: status };

  return new HttpError(message, normalizedStatus, body);
};

export const getNormalizedErrorStatus = (error: unknown): number | undefined => {
  const normalizedError = normalizeProviderError(error);
  return normalizedError instanceof HttpError ? normalizedError.status : undefined;
};

const ERROR_INTERCEPTOR_ID_KEY = '__errorInterceptorId';
type InterceptorAwareAxiosInstance = typeof AXIOS_INSTANCE & { [ERROR_INTERCEPTOR_ID_KEY]?: number };
const interceptorAwareAxiosInstance = AXIOS_INSTANCE as InterceptorAwareAxiosInstance;

const installErrorNormalizationInterceptor = () => {
  if (typeof interceptorAwareAxiosInstance[ERROR_INTERCEPTOR_ID_KEY] === 'number') {
    return;
  }

  interceptorAwareAxiosInstance[ERROR_INTERCEPTOR_ID_KEY] = AXIOS_INSTANCE.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(normalizeProviderError(error)),
  );
};

export const resetErrorInterceptor = () => {
  const interceptorId = interceptorAwareAxiosInstance[ERROR_INTERCEPTOR_ID_KEY];
  if (typeof interceptorId !== 'number') {
    return;
  }

  AXIOS_INSTANCE.interceptors.response.eject(interceptorId);
  delete interceptorAwareAxiosInstance[ERROR_INTERCEPTOR_ID_KEY];
};

installErrorNormalizationInterceptor();

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
    throw new Error(
      `Generated API function mapping for operation "${operationKey}" not found. ` +
        'Ensure ui-manifest.json is up to date (run npm run generate).',
    );
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
