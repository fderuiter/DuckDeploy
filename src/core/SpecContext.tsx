import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import specRaw from '../../openapi.yaml?raw';

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
        // Parse YAML to JSON object
        const parsedJson = yaml.load(specRaw);

        if (!parsedJson || typeof parsedJson !== 'object') {
          throw new Error('Failed to parse OpenAPI YAML');
        }

        // Resolve $ref pointers
        const resolvedSpec = await $RefParser.dereference(parsedJson as any);

        setSpec(resolvedSpec);
      } catch (err) {
        console.error('Error loading OpenAPI spec:', err);
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
