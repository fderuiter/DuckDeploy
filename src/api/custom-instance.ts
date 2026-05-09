import axios, { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosRequestConfig, RawAxiosRequestHeaders } from 'axios';

type CancelablePromise<T> = Promise<T> & { cancel?: () => void };

export const AXIOS_INSTANCE = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

AXIOS_INSTANCE.interceptors.response.use(
  (response) => {
    if (typeof response.data === 'string') {
      const lower = response.data.trimStart().toLowerCase();
      if (lower.startsWith('<html') || lower.startsWith('<!doctype')) {
        const truncatedHtml = response.data.length > 250
          ? response.data.slice(0, 250) + '... (truncated)'
          : response.data;

        const customError = new AxiosError(
          'Upstream format violation',
          'ERR_UPSTREAM_FORMAT_VIOLATION',
          response.config,
          response.request,
          {
            ...response,
            status: 500,
            data: { error: 'Upstream format violation', raw: truncatedHtml }
          }
        );
        return Promise.reject(customError);
      }
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      let { status } = error.response;
      const { config } = error.response;

      if (status === 404) {
        const headers = config.headers || {};
        const authKeys = ['authorization', 'api-key', 'x-api-key'];

        let hasMissingAuth = false;

        if (headers instanceof AxiosHeaders) {
          for (const key of authKeys) {
            if (headers.has(key)) {
              const val = headers.get(key);
              if (val === undefined || val === null || val === '') {
                hasMissingAuth = true;
                break;
              }
            }
          }
        } else {
          // Fallback if headers is a plain object
          for (const [headerKey, headerVal] of Object.entries(headers)) {
            if (authKeys.includes(headerKey.toLowerCase())) {
              if (headerVal === undefined || headerVal === null || headerVal === '') {
                hasMissingAuth = true;
                break;
              }
            }
          }
        }

        if (hasMissingAuth) {
          error.response.status = 401;
          error.message = 'Coerced 404 to 401: Missing authorization header';
          status = 401;
        }
      }

      if (status === 401 || status === 403) {
        const event = new CustomEvent('duckdeploy:auth_violation', {
          detail: {
            method: config.method?.toUpperCase(),
            url: config.url,
            status,
          },
        });
        window.dispatchEvent(event);
      }
    }

    return Promise.reject(error);
  },
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

export const customInstance = <T>(
  config: RequestInput,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const controller = new AbortController();
  const normalizedConfig = normalizeConfig(config, options);

  const promise = AXIOS_INSTANCE({
    ...normalizedConfig,
    signal: controller.signal,
  }).then(({ data }) => data) as CancelablePromise<T>;

  promise.cancel = () => {
    controller.abort();
  };

  return promise;
};
