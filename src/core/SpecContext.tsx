import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
    let worker: Worker | null = null;
    const loadSpec = async () => {
      try {
        worker = new Worker(new URL('./specWorker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (e) => {
          if (e.data.type === 'SUCCESS') {
            const { buffer } = e.data;
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(buffer);
            const parsedSpec = JSON.parse(jsonString);
            setSpec(parsedSpec);
            setIsLoading(false);
          } else if (e.data.type === 'ERROR') {
            setError(new Error(e.data.error));
            setIsLoading(false);
          }
          worker?.terminate();
        };

        worker.onerror = (e) => {
          setError(new Error(e.message || 'Worker error'));
          setIsLoading(false);
          worker?.terminate();
        };

        const encoder = new TextEncoder();
        const buffer = encoder.encode(specRaw).buffer;

        worker.postMessage({ buffer }, [buffer]);
      } catch (err) {
        console.error('Error loading OpenAPI spec:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    };

    loadSpec();

    return () => {
      if (worker) {
        worker.terminate();
      }
    };
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
