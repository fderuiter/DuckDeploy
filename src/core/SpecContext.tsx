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
        const specModule = await import('./spec.json');
        setSpec(specModule.default || specModule);
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
