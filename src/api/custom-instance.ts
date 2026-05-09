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
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      let { status } = error.response;
      const { config } = error.response;

      // Universal Fallback: Coerce 404 to 401 if auth headers are missing/empty
      if (status === 404 && config.headers) {
        const hasAuth =
          config.headers['api-key'] ||
          config.headers['Authorization'] ||
          config.headers['authorization'];
        if (!hasAuth) {
          status = 401;
          error.response.status = 401;
        }
      }

      // Universal Fallback: Payload Sanitizer
      if (
        typeof error.response.data === 'string' &&
        /^\s*<(?:!DOCTYPE|html)/i.test(error.response.data)
      ) {
        error.response.data = {
          error: 'Upstream format violation',
          raw: error.response.data,
        };
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
