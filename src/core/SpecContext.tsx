import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface SpecContextType {
  spec: any | null;
  uiManifest: any | null;
  isLoading: boolean;
  error: Error | null;
}

const SpecContext = createContext<SpecContextType | undefined>(undefined);

const sha256Hex = async (content: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const SpecProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [spec, setSpec] = useState<any | null>(null);
  const [uiManifest, setUiManifest] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadSpec = async () => {
      try {
        const schemaUrl = `${import.meta.env.BASE_URL}schema.json`;
        const manifestUrl = `${import.meta.env.BASE_URL}ui-manifest.json`;
        const [schemaResponse, manifestResponse] = await Promise.all([
          fetch(schemaUrl, {
            headers: { Accept: 'application/json' },
          }),
          fetch(manifestUrl, {
            headers: { Accept: 'application/json' },
          }),
        ]);

        if (!schemaResponse.ok) {
          throw new Error(`Failed to load compiled schema: ${schemaResponse.status} ${schemaResponse.statusText}`);
        }

        const parsedJson = await schemaResponse.json();

        if (!parsedJson || typeof parsedJson !== 'object') {
          throw new Error('Failed to parse compiled OpenAPI schema');
        }

        setSpec(parsedJson);

        if (manifestResponse.ok) {
          const manifestText = await manifestResponse.text();
          const expectedManifestHash = import.meta.env.VITE_MANIFEST_HASH;
          if (expectedManifestHash) {
            const actualManifestHash = await sha256Hex(manifestText);
            if (actualManifestHash !== expectedManifestHash) {
              const expectedPrefix = expectedManifestHash.slice(0, 8);
              const actualPrefix = actualManifestHash.slice(0, 8);
              throw new Error(
                `Manifest integrity check failed (expected ${expectedPrefix}…, got ${actualPrefix}…). The UI manifest may have been modified or corrupted.`,
              );
            }
          }

          const parsedManifest = JSON.parse(manifestText);
          if (parsedManifest && typeof parsedManifest === 'object') {
            setUiManifest(parsedManifest);
          }
        } else {
          console.warn(
            `ui-manifest.json is unavailable (${manifestResponse.status} ${manifestResponse.statusText}); precomputed UI mapping is disabled for this session.`,
          );
        }
      } catch (err) {
        console.error('Error loading compiled OpenAPI schema:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    loadSpec();
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
