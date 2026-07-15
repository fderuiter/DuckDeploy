import { createContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { useSafeContext } from '../utils/context';
import type { ManifestWorkerResponse } from '../workers/manifest.worker';
// Vite processes the `?worker` suffix at build time and bundles the worker
// as a separate chunk — must be a static import at the top level.
import ManifestWorkerConstructor from '../workers/manifest.worker?worker';
import { customInstance } from '../api/custom-instance';
import { SCHEMA_FILENAME, MANIFEST_FILENAME } from '@duckdeploy/openapi';

export interface SpecContextType {
  spec: any | null;
  uiManifest: any | null;
  isLoading: boolean;
  error: Error | null;
}

const SpecContext = createContext<SpecContextType | undefined>(undefined);

/**
 * Generated description.
 *
 */
export const SpecProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [spec, setSpec] = useState<any | null>(null);
  const [uiManifest, setUiManifest] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSpec = async () => {
      try {
        const schemaUrl = new URL(SCHEMA_FILENAME, window.location.origin + import.meta.env.BASE_URL).toString();
        const manifestUrl = `${import.meta.env.BASE_URL}${MANIFEST_FILENAME}`;

        // ── Start both requests concurrently ─────────────────────────────────
        // The worker begins fetching + hashing ui-manifest.json in parallel
        // while the main thread fetches and parses schema.json.
        const manifestPromise = new Promise<void>((resolve, reject) => {
          const worker = new ManifestWorkerConstructor();

          worker.onmessage = (event: MessageEvent<ManifestWorkerResponse>) => {
            if (event.data.type === "auth_violation") {
              window.dispatchEvent(new CustomEvent("duckdeploy:auth_violation", { detail: event.data.detail }));
              return;
            }
            worker.terminate();

            if (event.data.type === 'error') {
              reject(new Error(event.data.error));
              return;
            }

            // Decode the transferred ArrayBuffer on the main thread.
            // The buffer was moved (not copied) from the worker — zero-copy.
            try {
              const text = new TextDecoder().decode(event.data.buffer);
              const parsedManifest = JSON.parse(text);
              if (parsedManifest && typeof parsedManifest === 'object' && !cancelled) {
                setUiManifest(parsedManifest);
              }
              resolve();
            } catch (parseErr) {
              reject(parseErr instanceof Error ? parseErr : new Error(String(parseErr)));
            }
          };

          worker.onerror = (err) => {
            worker.terminate();
            const parts: string[] = [];
            if (err.message) parts.push(err.message);
            if (err.filename) {
              parts.push(err.lineno != null ? `(${err.filename}:${err.lineno})` : `(${err.filename})`);
            }
            reject(
              new Error(
                parts.length > 0
                  ? parts.join(' ')
                  : 'Manifest worker encountered an unexpected error',
              ),
            );
          };

          worker.postMessage({ url: manifestUrl });
        });

                // ── 1. Schema fetch (main thread) ─────────────────────────────────────
        const parsedJson = await customInstance<any>({
          url: schemaUrl,
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
        if (!parsedJson || typeof parsedJson !== 'object') {
          console.error('Failed to parse compiled OpenAPI schema');
          throw new Error('Failed to parse compiled OpenAPI schema');
        }

        console.log('Schema loaded successfully. Keys:', Object.keys(parsedJson.data || parsedJson));
        if (!cancelled) setSpec(parsedJson.data || parsedJson);

        // ── 2. Await the manifest worker (likely already done by now) ─────────
        console.log('Waiting for manifest worker...');
        await manifestPromise;
        console.log('Manifest worker finished');
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading compiled OpenAPI schema:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadSpec();

    return () => {
      cancelled = true;
    };
  }, []);

  const contextValue = useMemo(() => ({ spec, uiManifest, isLoading, error }), [spec, uiManifest, isLoading, error]);

  return (
    <SpecContext.Provider value={contextValue}>
      {children}
    </SpecContext.Provider>
  );
};

/**
 * Generated description.
 *
 */
export const useSpec = () => {
  return useSafeContext(SpecContext, 'useSpec must be used within a SpecProvider');
};
