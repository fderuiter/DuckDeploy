import { AXIOS_INSTANCE } from '../api/custom-instance';

export type ManifestWorkerRequest = {
  url: string;
};

export type ManifestWorkerResponse =
  | { type: 'success'; buffer: ArrayBuffer }
  | { type: 'error'; error: string }
  | { type: 'auth_violation'; detail: any };

self.onmessage = async (event: MessageEvent<ManifestWorkerRequest>) => {
  const { url } = event.data;

  try {
    const response = await AXIOS_INSTANCE.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      headers: { Accept: 'application/json' },
      baseURL: ''
    });

    const buffer = response.data;
    
    self.postMessage(
      { type: 'success', buffer } satisfies ManifestWorkerResponse,
      [buffer] as any,
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    } satisfies ManifestWorkerResponse);
  }
};
