import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SchemaParserResponse } from '../workers/schemaParser.worker';
// Vite processes the `?worker` suffix at build time and bundles the worker
// as a separate chunk — must be a static import at the top level.
import SchemaParserWorkerConstructor from '../workers/schemaParser.worker?worker';
import type { ResourceDefinition } from './discovery';

export interface SpecContextType {
  spec: any | null;
  uiManifest: any | null;
  /** Pre-computed resource routing tree built by the schema parser worker. */
  resources: ResourceDefinition[];
  isLoading: boolean;
  error: Error | null;
}

const SpecContext = createContext<SpecContextType | undefined>(undefined);

export const SpecProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [spec, setSpec] = useState<any | null>(null);
  const [uiManifest, setUiManifest] = useState<any | null>(null);
  const [resources, setResources] = useState<ResourceDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Track cancellation without triggering re-renders.
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    // The schemaParser worker fetches both schema.json and ui-manifest.json
    // concurrently, validates the manifest SHA-256 hash, parses both JSONs,
    // and builds the resource routing tree — all off the main thread.
    // The main thread renders only a lightweight loading indicator until the
    // worker posts its result.
    const worker = new SchemaParserWorkerConstructor();

    worker.onmessage = (event: MessageEvent<SchemaParserResponse>) => {
      if (cancelledRef.current) {
        worker.terminate();
        return;
      }

      worker.terminate();

      if (event.data.type === 'error') {
        setError(new Error(event.data.error));
        setIsLoading(false);
        return;
      }

      const { manifest, spec: parsedSpec, resources: discoveredResources } = event.data;

      if (parsedSpec && typeof parsedSpec === 'object') setSpec(parsedSpec);
      if (manifest && typeof manifest === 'object') setUiManifest(manifest);
      setResources(discoveredResources);
      setIsLoading(false);
    };

    worker.onerror = (err) => {
      if (cancelledRef.current) {
        worker.terminate();
        return;
      }

      worker.terminate();

      const parts: string[] = [];
      if (err.message) parts.push(err.message);
      if (err.filename) {
        parts.push(err.lineno != null ? `(${err.filename}:${err.lineno})` : `(${err.filename})`);
      }
      setError(
        new Error(
          parts.length > 0
            ? parts.join(' ')
            : 'Schema parser worker encountered an unexpected error',
        ),
      );
      setIsLoading(false);
    };

    const manifestUrl = `${import.meta.env.BASE_URL}ui-manifest.json`;
    const schemaUrl = `${import.meta.env.BASE_URL}schema.json`;
    const expectedHash = import.meta.env.VITE_MANIFEST_HASH as string;

    worker.postMessage({ manifestUrl, schemaUrl, expectedHash });

    return () => {
      cancelledRef.current = true;
      worker.terminate();
    };
  }, []);

  return (
    <SpecContext.Provider value={{ spec, uiManifest, resources, isLoading, error }}>
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
