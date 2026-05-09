/// <reference lib="webworker" />
/**
 * manifest.worker.ts – Phase 6.1: Web Worker AST Offloading
 *
 * Runs off the main thread to:
 *   1. Fetch ui-manifest.json as a raw ArrayBuffer (keeps large-schema
 *      network I/O and SHA-256 hashing off the UI thread).
 *   2. Transfer the ArrayBuffer back to the main thread via a
 *      Transferable Object (zero-copy move, no memory duplication).
 *
 * The main thread then decodes the transferred buffer and parses the JSON.
 */

export type ManifestWorkerRequest = {
  url: string;
};

export type ManifestWorkerResponse =
  | { type: 'success'; buffer: ArrayBuffer }
  | { type: 'error'; error: string };

self.onmessage = async (event: MessageEvent<ManifestWorkerRequest>) => {
  const { url } = event.data;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      self.postMessage({
        type: 'error',
        error: `Failed to fetch manifest: ${response.status} ${response.statusText}`,
      } satisfies ManifestWorkerResponse);
      return;
    }

    // Obtain raw bytes — this is the data that will be transferred zero-copy.
    const buffer = await response.arrayBuffer();

    // Transfer the buffer to the main thread — zero-copy move.
    // After this call the buffer is detached inside the worker and the main
    // thread owns the underlying memory region.
    self.postMessage(
      { type: 'success', buffer } satisfies ManifestWorkerResponse,
      [buffer],
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    } satisfies ManifestWorkerResponse);
  }
};
