import axios, { AxiosError, AxiosRequestConfig } from 'axios';

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

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const controller = new AbortController();

  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    signal: controller.signal,
  }).then(({ data }) => data);

  // @ts-expect-error - Orval expects cancel to exist on the returned promise.
  promise.cancel = () => {
    controller.abort();
  };

  return promise;
};
