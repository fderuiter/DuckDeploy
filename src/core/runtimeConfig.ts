import { DEFAULT_PROXY_PREFIX, HEALTH_CHECK_PATH } from '@duckdeploy/openapi';

const DEFAULT_LOCAL_PROXY_BASE_URL = DEFAULT_PROXY_PREFIX;
const LOCALHOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const normalizeConfiguredBaseUrl = (value: string | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimTrailingSlashes(trimmed);
};

const isLocalRuntime = () =>
  typeof window !== 'undefined' && LOCALHOSTS.has(window.location.hostname);

const joinRelativeUrl = (baseUrl: string, suffix: string) =>
  `${trimTrailingSlashes(baseUrl)}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;

export interface RuntimeApiConfig {
  apiBaseUrl: string | null;
  healthUrl: string | null;
  source: 'env' | 'local-default' | 'missing';
  message?: string;
}

/**
 * Generated description.
 *
 */
export const getRuntimeApiConfig = (): RuntimeApiConfig => {
  const configuredBaseUrl = normalizeConfiguredBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (configuredBaseUrl) {
    return {
      apiBaseUrl: configuredBaseUrl,
      healthUrl: joinRelativeUrl(configuredBaseUrl, HEALTH_CHECK_PATH),
      source: 'env',
    };
  }

  if (isLocalRuntime()) {
    return {
      apiBaseUrl: DEFAULT_LOCAL_PROXY_BASE_URL,
      healthUrl: joinRelativeUrl(DEFAULT_LOCAL_PROXY_BASE_URL, HEALTH_CHECK_PATH),
      source: 'local-default',
    };
  }

  return {
    apiBaseUrl: null,
    healthUrl: null,
    source: 'missing',
    message:
      'Set VITE_API_BASE_URL to the deployed CDISC proxy base URL (for example, https://proxy.example.com/api/cdisc).',
  };
};
