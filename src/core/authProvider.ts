import type { AxiosRequestConfig } from 'axios';
import type { AuthProvider } from 'react-admin';
import { AXIOS_INSTANCE } from '../api/custom-instance';
import { getNormalizedErrorStatus } from '../providers/openApiDataProvider';
import type { ResourceDefinition } from './discovery';

type ResourceAction = 'list' | 'show' | 'create' | 'edit' | 'delete';

const AUTH_PROBE_ID = '__duckdeploy_auth_probe__';
const accessCache = new Map<string, Promise<boolean>>();
let resourceMap: Record<string, ResourceDefinition> = {};
const resourceActions: ResourceAction[] = ['list', 'show', 'create', 'edit', 'delete'];

const buildCacheKey = (resource: string, action: string) => `${resource}:${action}`;

const createProbeToken = (pathParam: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${AUTH_PROBE_ID}_${pathParam}_${crypto.randomUUID()}`;
  }

  return `${AUTH_PROBE_ID}_${pathParam}_${Math.random().toString(36).slice(2)}`;
};

const buildProbeUrl = (path: string) =>
  path.replace(/\{([^/}]+)\}/g, (_match, pathParam: string) => createProbeToken(pathParam));

const isResourceAction = (action: string): action is ResourceAction => resourceActions.includes(action as ResourceAction);

const buildProbeRequest = (resourceDefinition: ResourceDefinition, action: ResourceAction): AxiosRequestConfig | null => {
  switch (action) {
    case 'list':
      return resourceDefinition.listPath ? { method: 'get', url: buildProbeUrl(resourceDefinition.listPath) } : null;
    case 'show':
      return resourceDefinition.showPath ? { method: 'get', url: buildProbeUrl(resourceDefinition.showPath) } : null;
    case 'create':
      // Use OPTIONS for mutating actions so permission checks don't create, update, or delete data.
      // Any non-401/403 result (including 405 when OPTIONS isn't implemented) is treated as allowed.
      return resourceDefinition.createPath ? { method: 'options', url: buildProbeUrl(resourceDefinition.createPath) } : null;
    case 'edit':
      return resourceDefinition.editPath
        ? { method: 'options', url: buildProbeUrl(resourceDefinition.editPath) }
        : null;
    case 'delete':
      return resourceDefinition.deletePath ? { method: 'options', url: buildProbeUrl(resourceDefinition.deletePath) } : null;
    default:
      return null;
  }
};

const probeAccess = async (resource: string, action: ResourceAction) => {
  const resourceDefinition = resourceMap[resource];
  if (!resourceDefinition) {
    return false;
  }

  const requestConfig = buildProbeRequest(resourceDefinition, action);
  if (!requestConfig) {
    return false;
  }

  try {
    await AXIOS_INSTANCE.request(requestConfig);
    return true;
  } catch (error) {
    const normalizedStatus = getNormalizedErrorStatus(error);
    if (typeof normalizedStatus !== 'number') {
      return false;
    }
    return normalizedStatus !== 401 && normalizedStatus !== 403;
  }
};

export const setAuthorizationResources = (resources: ResourceDefinition[]) => {
  resourceMap = resources.reduce<Record<string, ResourceDefinition>>((acc, resourceDefinition) => {
    acc[resourceDefinition.name] = resourceDefinition;
    return acc;
  }, {});
  accessCache.clear();
};

export const duckDeployAuthProvider: AuthProvider = {
  async login() {},
  async logout() {},
  async checkAuth() {},
  async checkError() {},
  async getPermissions() {
    return accessCache;
  },
  async canAccess({ resource, action }) {
    if (!resource) {
      return true;
    }

    if (!isResourceAction(action)) {
      return true;
    }

    const cacheKey = buildCacheKey(resource, action);
    const cached = accessCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const accessPromise = probeAccess(resource, action);
    accessCache.set(cacheKey, accessPromise);
    return accessPromise;
  },
};
