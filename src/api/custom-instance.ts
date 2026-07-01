import axios, { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosRequestConfig, RawAxiosRequestHeaders, AxiosResponse } from 'axios';
import { getRuntimeApiConfig } from '../core/runtimeConfig';

type CancelablePromise<T> = Promise<T> & { cancel?: () => void };

const runtimeConfig = getRuntimeApiConfig();

/**
 *
 */
export class NormalizedHttpError extends Error {
  public title?: string;
  public details?: string[];

  /**
   * Generated description.
   *
   */
  constructor(
    public readonly message: string,
    public readonly status: number,
    public readonly body: any = null,
  ) {
    super(message);
    this.name = 'HttpError';
    
    // Polyfill for Error.captureStackTrace
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

const extractErrorMessage = (payload: unknown): string | undefined => {
  if (!payload) return undefined;
  if (typeof payload === 'string' && payload.trim().length > 0) return payload;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const message = extractErrorMessage(entry);
      if (message) return message;
    }
    return undefined;
  }
  if (typeof payload === 'object') {
    const source = payload as Record<string, unknown>;
    for (const candidate of ['message', 'detail', 'title', 'error', 'error_description']) {
      const value = source[candidate];
      if (typeof value === 'string' && value.trim().length > 0) return value;
    }
  }
  return undefined;
};

const extractErrorCode = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const source = payload as Record<string, unknown>;
  for (const candidate of ['code', 'errorCode', 'type', 'reason']) {
    const value = source[candidate];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
};

const AUTH_HINT_PATTERN = /\b(unauthori[sz]ed|authentication required|not authenticated|invalid token|token expired|missing credentials)\b/i;
const FORBIDDEN_HINT_PATTERN = /\b(forbidden|insufficient permissions?|not allowed|access denied)\b/i;

const getHeaderValue = (headers: unknown, headerName: string): string | undefined => {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalizedHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== normalizedHeaderName) continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      const firstString = value.find((entry): entry is string => typeof entry === 'string');
      if (firstString) return firstString;
    }
  }
  return undefined;
};

const normalizeErrorStatus = (status: number, message: string, responseData: unknown, responseHeaders: unknown): number => {
  if (status === 401 || status === 403) return status;
  if (status !== 404 && (status < 500 || status > 599)) return status;

  const errorCode = extractErrorCode(responseData);
  const hasWwwAuthenticateHeader = typeof getHeaderValue(responseHeaders, 'www-authenticate') === 'string';
  const hasAuthHint =
    AUTH_HINT_PATTERN.test(message) ||
    (typeof errorCode === 'string' && AUTH_HINT_PATTERN.test(errorCode)) ||
    hasWwwAuthenticateHeader;

  if (!hasAuthHint) return status;

  const isForbiddenHint =
    FORBIDDEN_HINT_PATTERN.test(message) ||
    (typeof errorCode === 'string' && FORBIDDEN_HINT_PATTERN.test(errorCode));

  return isForbiddenHint ? 403 : 401;
};

const dispatchNormalizedAuthViolation = (error: AxiosError, status: number) => {
  const requestConfig = error?.response?.config ?? error?.config;
  const detail = {
    method: requestConfig?.method?.toUpperCase(),
    url: requestConfig?.url,
    status,
  };

  if (typeof window !== 'undefined') {
    const event = new CustomEvent('duckdeploy:auth_violation', { detail });
    window.dispatchEvent(event);
  } else if (typeof self !== 'undefined' && 'postMessage' in self) {
    (self as any).postMessage({ type: 'auth_violation', detail });
  }
};

/**
 * Generated description.
 *
 */
export const normalizeProviderError = (error: unknown): unknown => {
  if (error instanceof NormalizedHttpError) {
    return error;
  }

  // React Admin's HttpError check
  if (error instanceof Error && error.name === 'HttpError') {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    return error;
  }

  const status = typeof error.response?.status === 'number' ? error.response.status : 0;
  const responseData = error.response?.data;
  const extractedMessage = extractErrorMessage(responseData);
  
  let message = extractedMessage ?? error.message ?? 'An unexpected error occurred while communicating with the API.';
  const normalizedStatus = normalizeErrorStatus(status, message, responseData, error.response?.headers);

  if (normalizedStatus === 401 || normalizedStatus === 403) {
    dispatchNormalizedAuthViolation(error, normalizedStatus);
  }

  let title: string | undefined;
  let details: string[] | undefined;

  const configUrl = error.config?.url ?? '';
  const isHealthCheck = configUrl === runtimeConfig.healthUrl;
  const isSpec = configUrl.endsWith('schema.json') || configUrl.endsWith('ui-manifest.json');

  // Issue Factory logic for Bootstrap phase
  if (isHealthCheck) {
    if (status === 0 || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      title = 'API proxy is unreachable';
      message = 'DuckDeploy could not reach the configured backend proxy.';
      details = [
        error.message,
        'Start the local proxy with `npm run proxy`, or deploy the backend proxy and set VITE_API_BASE_URL to its public base URL.',
      ];
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || error.name === 'TypeError') {
        message = 'DuckDeploy could not connect to the configured backend proxy.';
        details[0] = 'The proxy may be stopped, deployed at a different URL, or blocked by CORS/origin policy.';
      }
    } else {
      const payload = responseData as any;
      const fallbackMessage = `Proxy health check returned ${status} ${error.response?.statusText || ''}.`;
      if (payload?.code === 'PROXY_MISSING_API_KEY') {
        title = 'Proxy is missing CDISC credentials';
        message = payload.message ?? fallbackMessage;
        details = [
          'Set CDISC_PRIMARY_KEY and/or CDISC_SECONDARY_KEY on the proxy deployment.',
          'The GitHub Pages frontend should only receive VITE_API_BASE_URL, not the CDISC keys themselves.',
        ];
      } else {
        title = 'API proxy health check failed';
        message = payload?.message ?? fallbackMessage;
        details = [
          `HTTP status: ${status}`,
          payload?.upstreamBaseUrl ? `Configured upstream: ${payload.upstreamBaseUrl}` : 'Verify the proxy can reach the CDISC upstream API.',
        ];
      }
    }
  } else if (isSpec) {
    title = 'Application bootstrap failed';
    message = 'DuckDeploy could not load the compiled schema or UI manifest required to start.';
    details = [error.message];
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

  const httpError = new NormalizedHttpError(message, normalizedStatus, body);
  if (title) httpError.title = title;
  if (details) httpError.details = details;

  return httpError;
};

export const AXIOS_INSTANCE = axios.create({
  baseURL: runtimeConfig.apiBaseUrl ?? '',
  headers: {
    'Content-Type': 'application/json',
  },
});

AXIOS_INSTANCE.interceptors.response.use(
  (response) => { if (response.config.url === runtimeConfig.healthUrl && response.data?.ok === false) return Promise.reject(new axios.AxiosError("Health check failed", "ERR_HEALTH", response.config, response.request, response)); return response; },
  (error) => Promise.reject(normalizeProviderError(error)),
);

type RequestInput = string | AxiosRequestConfig;

const normalizeConfig = (
  input: RequestInput,
  options?: AxiosRequestConfig,
): AxiosRequestConfig => {
  if (typeof input === 'string') {
    const optionHeaders =
      options?.headers instanceof AxiosHeaders
        ? options.headers.toJSON()
        : (options?.headers as RawAxiosRequestHeaders | undefined);
    return {
      ...options,
      url: input,
      headers: optionHeaders,
    };
  }

  return { ...input, ...options };
};

/**
 * Generated description.
 *
 */
export const customInstance = <T>(
  config: RequestInput,
  options?: AxiosRequestConfig,
): CancelablePromise<AxiosResponse<T>> => {
  const controller = new AbortController();
  const normalizedConfig = normalizeConfig(config, options);

  const promise = AXIOS_INSTANCE({
    ...normalizedConfig,
    signal: controller.signal,
  }) as CancelablePromise<AxiosResponse<T>>;

  promise.cancel = () => {
    controller.abort();
  };

  return promise;
};
