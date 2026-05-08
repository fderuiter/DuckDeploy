/// <reference lib="webworker" />
/**
 * schemaParser.worker.ts – Phase 6.1: Web Worker AST Offloading
 *
 * Runs off the main thread to:
 *   1. Fetch ui-manifest.json and schema.json concurrently, keeping all
 *      network I/O off the UI thread.
 *   2. Verify the SHA-256 integrity hash of the manifest.
 *   3. Parse both JSON payloads off the UI thread.
 *   4. Build the initial resource routing tree via discoverResources so the
 *      main thread performs zero CPU-bound discovery work.
 *   5. Post the fully resolved data back to the main thread via structured
 *      clone — no re-parsing or re-discovery needed on receipt.
 *
 * The main thread renders only a lightweight loading indicator while this
 * worker runs, keeping Time to Interactive (TTI) minimal regardless of spec
 * size.
 */

import { discoverResources, type ResourceDefinition } from '../core/discovery';

export type SchemaParserRequest = {
  manifestUrl: string;
  schemaUrl: string;
  expectedHash: string;
};

export type SchemaParserResponse =
  | {
      type: 'success';
      manifest: unknown;
      spec: unknown;
      resources: ResourceDefinition[];
    }
  | { type: 'error'; error: string };

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

self.onmessage = async (event: MessageEvent<SchemaParserRequest>) => {
  const { manifestUrl, schemaUrl, expectedHash } = event.data;

  try {
    // Fetch both resources concurrently to minimise total I/O wait time.
    const [manifestResponse, schemaResponse] = await Promise.all([
      fetch(manifestUrl, { headers: { Accept: 'application/json' } }),
      fetch(schemaUrl, { headers: { Accept: 'application/json' } }),
    ]);

    if (!manifestResponse.ok) {
      self.postMessage({
        type: 'error',
        error: `Failed to fetch manifest: ${manifestResponse.status} ${manifestResponse.statusText}`,
      } satisfies SchemaParserResponse);
      return;
    }

    if (!schemaResponse.ok) {
      self.postMessage({
        type: 'error',
        error: `Failed to fetch schema: ${schemaResponse.status} ${schemaResponse.statusText}`,
      } satisfies SchemaParserResponse);
      return;
    }

    // Read both bodies concurrently as raw bytes.
    const [manifestBuffer, schemaBuffer] = await Promise.all([
      manifestResponse.arrayBuffer(),
      schemaResponse.arrayBuffer(),
    ]);

    // Validate manifest integrity before using the data.
    if (expectedHash) {
      const actualHash = await sha256Hex(manifestBuffer);
      if (actualHash !== expectedHash) {
        const expectedPrefix = expectedHash.slice(0, 8);
        const actualPrefix = actualHash.slice(0, 8);
        self.postMessage({
          type: 'error',
          error:
            `Hydration Integrity Error: manifest hash mismatch ` +
            `(expected ${expectedPrefix}…, got ${actualPrefix}…). ` +
            `The UI manifest may have been tampered with or corrupted.`,
        } satisfies SchemaParserResponse);
        return;
      }
    }

    // Parse both payloads — the CPU-bound work we keep off the main thread.
    const decoder = new TextDecoder();
    const parsedManifest = JSON.parse(decoder.decode(manifestBuffer)) as unknown;
    const parsedSpec = JSON.parse(decoder.decode(schemaBuffer)) as unknown;

    // Build the resource routing tree from the spec while still on the worker
    // thread so the main thread receives a ready-to-use data structure.
    const resources = discoverResources(parsedSpec);

    // Post the fully resolved data back. The parsed objects and resources array
    // are structured-cloned automatically — no additional work on the main thread.
    self.postMessage({
      type: 'success',
      manifest: parsedManifest,
      spec: parsedSpec,
      resources,
    } satisfies SchemaParserResponse);
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    } satisfies SchemaParserResponse);
  }
};
