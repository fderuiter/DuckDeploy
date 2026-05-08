import type { DataProvider, GetListResult } from 'react-admin';
import * as apiFunctions from '../api/generated';
import type { ResourceDefinition } from '../core/discovery';
import { adaptOutboundPayload } from './outboundAdapter';

// A mapping provided dynamically from the app root
let resourceMap: Record<string, ResourceDefinition> = {};

export const setResourceDefinitions = (resources: ResourceDefinition[]) => {
  resourceMap = resources.reduce((acc, res) => {
    acc[res.name] = res;
    return acc;
  }, {} as Record<string, ResourceDefinition>);
};

const transformResponse = (response: any): { data: any; total?: number } => {
  // Try to find the data array or object
  let data = response.data;

  if (data && data._embedded) {
    // common HAL structure
    const keys = Object.keys(data._embedded);
    if (keys.length > 0) {
      data = data._embedded[keys[0]];
    }
  } else if (data && Array.isArray(data.items)) {
    data = data.items;
  }

  // Ensure data is array for lists if needed, but getOne might return a single object
  // Let the caller handle it if they expect an array.

  let total: number | undefined;

  // 1. Header Check
  if (response.headers) {
    const totalCountHeader =
      response.headers['x-total-count'] ||
      response.headers['content-range'] ||
      import.meta.env.VITE_TOTAL_COUNT_HEADER && response.headers[import.meta.env.VITE_TOTAL_COUNT_HEADER.toLowerCase()];
    if (totalCountHeader) {
      if (typeof totalCountHeader === 'string' && totalCountHeader.includes('/')) {
        total = parseInt(totalCountHeader.split('/').pop() || '0', 10);
      } else {
        total = parseInt(totalCountHeader, 10);
      }
    }
  }

  // 2. Body Property Check
  if (total === undefined && response.data) {
    if (typeof response.data.total === 'number') total = response.data.total;
    else if (typeof response.data.count === 'number') total = response.data.count;
    else if (typeof response.data.totalCount === 'number') total = response.data.totalCount;
    else if (response.data.page && typeof response.data.page.totalElements === 'number') total = response.data.page.totalElements;
  }

  // 3. Array Fallback
  if (total === undefined && Array.isArray(data)) {
    total = data.length;
  }

  return { data, total };
};

const callApiFunction = async (operationId: string | undefined, ...args: any[]) => {
  if (!operationId) throw new Error('Operation not supported for this resource.');
  const fn = (apiFunctions as any)[operationId];
  if (!fn || typeof fn !== 'function') {
    throw new Error(`Generated API function ${operationId} not found.`);
  }
  return await fn(...args);
};

export const openApiDataProvider: DataProvider = {
  getList: async (resource, params) => {
    const resDef = resourceMap[resource];
    if (!resDef) throw new Error(`Unknown resource ${resource}`);

    // For list, often the parameters are passed as query objects.
    // Orval generated functions signature: apiFunction(params?, options?) or apiFunction(options?)
    // We try to pass React-Admin's sort/filter/pagination as query params.
    const queryParams: Record<string, any> = {
      ...params.filter,
    };
    if (params.pagination) {
      queryParams.page = params.pagination.page;
      queryParams.perPage = params.pagination.perPage;
      queryParams.limit = params.pagination.perPage;
      queryParams.offset = (params.pagination.page - 1) * params.pagination.perPage;
    }
    if (params.sort) {
      queryParams.sort = `${params.sort.field},${params.sort.order}`;
    }

    // Try to inject it. This is a best effort mapping since OpenAPI specs vary.
    // Many Orval APIs for lists take (params, options). If it doesn't take params, we just pass options.
    // Actually, orval generated functions usually have explicit typed params.
    // For generic handling, we'll try passing queryParams as the first argument if it expects any.
    // In generated.ts, it often expects explicit path parameters first. If this is a root list endpoint,
    // there are no path parameters, so the first argument might be query params or requestInit.

    // We will blindly pass queryParams. If the spec doesn't have query params, it might ignore them or fail.
    // In a zero-config template, we try to pass them.
    const response = await callApiFunction(resDef.listOperationId, queryParams);

    const transformed = transformResponse(response);
    let data = Array.isArray(transformed.data) ? transformed.data : [];

    // Add id to data if missing, React-Admin needs 'id'
    data = data.map((item: any, index: number) => ({
      id: item.id || item._id || item.uuid || index,
      ...item
    }));

    return {
      data,
      total: transformed.total !== undefined ? transformed.total : data.length,
    } as GetListResult;
  },

  getOne: async (resource, params) => {
    const resDef = resourceMap[resource];
    if (!resDef) throw new Error(`Unknown resource ${resource}`);

    // getOne usually expects the ID as the first parameter for path injection
    const response = await callApiFunction(resDef.showOperationId, String(params.id));
    const transformed = transformResponse(response);

    const data = transformed.data;
    if (!data.id) {
      data.id = params.id;
    }

    return { data };
  },

  getMany: async (resource, params) => {
    // Basic fallback for getMany using getOne
    const data = await Promise.all(
      params.ids.map(id => openApiDataProvider.getOne(resource, { id }).then(res => res.data))
    );
    return { data };
  },

  getManyReference: async (resource, params) => {
    // basic fallback
    return openApiDataProvider.getList(resource, {
      ...params,
      filter: { ...params.filter, [params.target]: params.id }
    });
  },

  update: async (resource, params) => {
    const resDef = resourceMap[resource];
    if (!resDef) throw new Error(`Unknown resource ${resource}`);

    // Sanitize through outbound adapter before dispatch
    const sanitizedData = adaptOutboundPayload(params.data, resDef.editRequestBodySchema);

    // Usually: updateById(id, data, options)
    const response = await callApiFunction(resDef.editOperationId, String(params.id), sanitizedData);
    const transformed = transformResponse(response);

    const data = transformed.data || params.data;
    if (!data.id) data.id = params.id;

    return { data };
  },

  updateMany: async (resource, params) => {
    const data = await Promise.all(
      params.ids.map(id => openApiDataProvider.update(resource, { id, data: params.data, previousData: {} as any as any }).then(res => res.data))
    );
    return { data: data.map(d => d.id) };
  },

  create: async (resource, params) => {
    const resDef = resourceMap[resource];
    if (!resDef) throw new Error(`Unknown resource ${resource}`);

    // Sanitize through outbound adapter before dispatch
    const sanitizedData = adaptOutboundPayload(params.data, resDef.createRequestBodySchema);

    // Usually: create(data, options)
    const response = await callApiFunction(resDef.createOperationId, sanitizedData);
    const transformed = transformResponse(response);

    const data = transformed.data
      ? { id: transformed.data.id ?? params.data.id ?? null, ...transformed.data }
      : { id: params.data.id ?? null, ...sanitizedData };

    return { data };
  },

  delete: async (resource, params) => {
    const resDef = resourceMap[resource];
    if (!resDef) throw new Error(`Unknown resource ${resource}`);

    const response = await callApiFunction(resDef.deleteOperationId, String(params.id));
    const transformed = transformResponse(response);

    return { data: transformed.data || params.previousData };
  },

  deleteMany: async (resource, params) => {
    await Promise.all(
      params.ids.map(id => openApiDataProvider.delete(resource, { id, previousData: {} as any }))
    );
    return { data: params.ids };
  },
};
