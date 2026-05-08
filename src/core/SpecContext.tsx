import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface SpecContextType {
  spec: any | null;
  isLoading: boolean;
  error: Error | null;
}

const SpecContext = createContext<SpecContextType | undefined>(undefined);

export const SpecProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [spec, setSpec] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadSpec = async () => {
      try {
        const schemaUrl = `${import.meta.env.BASE_URL}schema.json`;
        const response = await fetch(schemaUrl, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Failed to load compiled schema: ${response.status} ${response.statusText}`);
        }

        const parsedJson = await response.json();

        if (!parsedJson || typeof parsedJson !== 'object') {
          throw new Error('Failed to parse compiled OpenAPI schema');
        }

        setSpec(parsedJson);
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
    <SpecContext.Provider value={{ spec, isLoading, error }}>
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
