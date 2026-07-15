import type { AxiosRequestConfig } from 'axios';
import type { AuthProvider } from 'react-admin';
import { AXIOS_INSTANCE } from '../api/custom-instance';
import { getNormalizedErrorStatus } from '../providers/openApiDataProvider';
import type { ResourceDefinition } from '@duckdeploy/types';

type ResourceAction = 'list' | 'show' | 'create' | 'edit' | 'delete';

const AUTH_PROBE_ID = '__duckdeploy_auth_probe__';
const accessCache = new Map<string, Promise<boolean>>();
let resourceMap: Record<string, ResourceDefinition> = {};
const resourceActions: ResourceAction[] = ['list', 'show', 'create', 'edit', 'delete'];

const buildCacheKey = (resource: string, action: string) => `${resource}:${action}`;

const createProbeToken = (pathParam: string) => {
  if (typeof crypto.randomUUID === 'function') {
    return `${AUTH_PROBE_ID}_${pathParam}_${crypto.randomUUID()}`;
  }

  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const fallbackToken = Array.from(bytes, (value) => value.toString(16)).join('');
  return `${AUTH_PROBE_ID}_${pathParam}_${fallbackToken}`;
};

const buildProbeUrl = (path: string) =>
  path.replace(/\{([^/}]+)\}/g, (_match, pathParam: string) => createProbeToken(pathParam));

const isResourceAction = (action: string): action is ResourceAction => resourceActions.includes(action as ResourceAction);

const isAllowedProbeStatus = (action: ResourceAction, status: number) => {
  if (status >= 200 && status < 300) {
    return true;
  }

  if (status === 400 || status === 404) {
    return true;
  }

  return status === 405 && (action === 'create' || action === 'edit' || action === 'delete');
};

const buildProbeRequest = (resourceDefinition: ResourceDefinition, action: ResourceAction): AxiosRequestConfig | null => {
  switch (action) {
    case 'list':
      return resourceDefinition.listPath ? { method: 'get', url: buildProbeUrl(resourceDefinition.listPath) } : null;
    case 'show':
      return resourceDefinition.showPath ? { method: 'get', url: buildProbeUrl(resourceDefinition.showPath) } : null;
    case 'create':
      // Use OPTIONS for mutating actions so permission checks don't create, update, or delete data.
      // A 405 response is treated as allowed for mutating probes because it means the endpoint exists,
      // but the server does not implement OPTIONS for it.
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
    if (normalizedStatus === 401 || normalizedStatus === 403) {
      return false;
    }
    return isAllowedProbeStatus(action, normalizedStatus);
  }
};

/**
 * Generated description.
 *
 */
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
