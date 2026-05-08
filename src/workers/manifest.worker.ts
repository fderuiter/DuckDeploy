/**
 * manifest.worker.ts – Phase 6.1: Web Worker AST Offloading
 *
 * Runs off the main thread to:
 *   1. Fetch ui-manifest.json as a raw ArrayBuffer (avoids a second
 *      main-thread fetch and keeps large-schema I/O off the UI thread).
 *   2. Verify the SHA-256 integrity hash injected at build time.
 *   3. Transfer the verified ArrayBuffer back to the main thread via a
 *      Transferable Object (zero-copy move, no memory duplication).
 *
 * The main thread decodes + parses the transferred buffer, keeping the
 * expensive JSON.parse() on a React render cycle that the browser can
 * schedule independently of the main event loop.
 */

export type ManifestWorkerRequest = {
  url: string;
  expectedHash: string;
};

export type ManifestWorkerResponse =
  | { type: 'success'; buffer: ArrayBuffer }
  | { type: 'error'; error: string };

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

self.onmessage = async (event: MessageEvent<ManifestWorkerRequest>) => {
  const { url, expectedHash } = event.data;

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

    if (expectedHash) {
      const actualHash = await sha256Hex(buffer);
      if (actualHash !== expectedHash) {
        const expectedPrefix = expectedHash.slice(0, 8);
        const actualPrefix = actualHash.slice(0, 8);
        self.postMessage({
          type: 'error',
          error:
            `Hydration Integrity Error: manifest hash mismatch ` +
            `(expected ${expectedPrefix}…, got ${actualPrefix}…). ` +
            `The UI manifest may have been tampered with or corrupted.`,
        } satisfies ManifestWorkerResponse);
        return;
      }
    }

    // Transfer the buffer to the main thread — zero-copy move.
    // After this call the buffer is detached inside the worker and the main
    // thread owns the underlying memory region.
    (self as unknown as Worker).postMessage(
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
