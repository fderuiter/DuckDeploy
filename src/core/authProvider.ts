import type { AxiosRequestConfig } from 'axios';
import type { AuthProvider } from 'react-admin';
import { AXIOS_INSTANCE } from '../api/custom-instance';
import { getNormalizedErrorStatus } from '../providers/openApiDataProvider';
import type { ResourceDefinition } from './discovery';

type ResourceAction = 'list' | 'show' | 'create' | 'edit' | 'delete';

const AUTH_PROBE_ID = '__duckdeploy_auth_probe__';
const accessCache = new Map<string, Promise<boolean>>();
let resourceMap: Record<string, ResourceDefinition> = {};

const buildCacheKey = (resource: string, action: string) => `${resource}:${action}`;

const buildProbeUrl = (path: string) => path.replace(/\{[^/]+\}/g, AUTH_PROBE_ID);

const buildProbeRequest = (resourceDefinition: ResourceDefinition, action: ResourceAction): AxiosRequestConfig | null => {
  switch (action) {
    case 'list':
      return resourceDefinition.listPath ? { method: 'get', url: buildProbeUrl(resourceDefinition.listPath) } : null;
    case 'show':
      return resourceDefinition.showPath ? { method: 'get', url: buildProbeUrl(resourceDefinition.showPath) } : null;
    case 'create':
      return resourceDefinition.createPath ? { method: 'options', url: buildProbeUrl(resourceDefinition.createPath) } : null;
    case 'edit':
      return resourceDefinition.editPath && resourceDefinition.editMethod
        ? { method: resourceDefinition.editMethod, url: buildProbeUrl(resourceDefinition.editPath), data: {} }
        : null;
    case 'delete':
      return resourceDefinition.deletePath ? { method: 'delete', url: buildProbeUrl(resourceDefinition.deletePath) } : null;
    default:
      return null;
  }
};

const probeAccess = async (resource: string, action: ResourceAction) => {
  const resourceDefinition = resourceMap[resource];
  if (!resourceDefinition) {
    return true;
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

    if (!['list', 'show', 'create', 'edit', 'delete'].includes(action)) {
      return true;
    }

    const cacheKey = buildCacheKey(resource, action);
    const cached = accessCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const accessPromise = probeAccess(resource, action as ResourceAction);
    accessCache.set(cacheKey, accessPromise);
    return accessPromise;
  },
};
