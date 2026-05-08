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
      const { status, config } = error.response;

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

const toPlainHeaders = (headers: unknown): Record<string, string> => {
  if (headers instanceof AxiosHeaders) {
    return headers.toJSON() as Record<string, string>;
  }

  if (headers && typeof headers === 'object') {
    return Object.fromEntries(
      Object.entries(headers as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
    );
  }

  return {};
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
  }).then(({ data, status, headers }) => ({
    data,
    status,
    headers: toPlainHeaders(headers),
  })) as CancelablePromise<T>;

  promise.cancel = () => {
    controller.abort();
  };

  return promise;
};
