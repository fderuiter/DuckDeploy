import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ManifestWorkerResponse } from '../workers/manifest.worker';
// Vite processes the `?worker` suffix at build time and bundles the worker
// as a separate chunk — must be a static import at the top level.
import ManifestWorkerConstructor from '../workers/manifest.worker?worker';

export interface SpecContextType {
  spec: any | null;
  uiManifest: any | null;
  isLoading: boolean;
  error: Error | null;
}

const SpecContext = createContext<SpecContextType | undefined>(undefined);

export const SpecProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [spec, setSpec] = useState<any | null>(null);
  const [uiManifest, setUiManifest] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSpec = async () => {
      try {
        // ── 1. Fetch the compiled JSON schema (main thread, small payload) ──
        const schemaUrl = `${import.meta.env.BASE_URL}schema.json`;
        const schemaResponse = await fetch(schemaUrl, {
          headers: { Accept: 'application/json' },
        });

        if (!schemaResponse.ok) {
          throw new Error(
            `Failed to load compiled schema: ${schemaResponse.status} ${schemaResponse.statusText}`,
          );
        }

        const parsedJson = await schemaResponse.json();
        if (!parsedJson || typeof parsedJson !== 'object') {
          throw new Error('Failed to parse compiled OpenAPI schema');
        }

        if (!cancelled) setSpec(parsedJson);

        // ── 2. Offload manifest fetch + integrity check to a Web Worker ─────
        //    (Phase 6.1 – Web Worker AST Offloading)
        //    The worker fetches ui-manifest.json as a raw ArrayBuffer, verifies
        //    the SHA-256 hash injected at build time, and transfers the buffer
        //    back to this thread via a Transferable Object (zero-copy).
        const manifestUrl = `${import.meta.env.BASE_URL}ui-manifest.json`;
        const expectedHash = import.meta.env.VITE_MANIFEST_HASH as string;

        await new Promise<void>((resolve, reject) => {
          const worker = new ManifestWorkerConstructor();

          worker.onmessage = (event: MessageEvent<ManifestWorkerResponse>) => {
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
            reject(new Error(err.message ?? 'Manifest worker encountered an unexpected error'));
          };

          worker.postMessage({ url: manifestUrl, expectedHash });
        });
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

  return (
    <SpecContext.Provider value={{ spec, uiManifest, isLoading, error }}>
      {children}
    </SpecContext.Provider>
  );
};

export const useSpec = () => {
  const context = useContext(SpecContext);
  if (context === undefined) {
    throw new Error('useSpec must be used within a SpecProvider');
  }
  return context;
};
