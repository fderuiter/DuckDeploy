import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface AuthViolation {
  method?: string;
  url?: string;
  status: number;
}

interface ReflectiveAuthContextType {
  deniedEndpoints: Set<string>;
  isAllowed: (method: string, endpoint: string) => boolean;
}

const ReflectiveAuthContext = createContext<ReflectiveAuthContextType | undefined>(undefined);

export const ReflectiveAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [deniedEndpoints, setDeniedEndpoints] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleAuthViolation = (event: Event) => {
      const customEvent = event as CustomEvent<AuthViolation>;
      const method = (customEvent.detail.method || '').toUpperCase();
      const rawUrl = customEvent.detail.url || '';
      const normalizedUrl = rawUrl.split('?')[0];

      if (!method || !normalizedUrl) {
        return;
      }

      const signature = `${method}:${normalizedUrl}`;
      setDeniedEndpoints((prev) => new Set(prev).add(signature));
    };

    window.addEventListener('duckdeploy:auth_violation', handleAuthViolation);

    return () => {
      window.removeEventListener('duckdeploy:auth_violation', handleAuthViolation);
    };
  }, []);

  const isAllowed = (method: string, endpoint: string) => {
    const normalizedMethod = method.toUpperCase();
    const normalizedEndpoint = endpoint.split('?')[0];
    return !deniedEndpoints.has(`${normalizedMethod}:${normalizedEndpoint}`);
  };

  return <ReflectiveAuthContext.Provider value={{ deniedEndpoints, isAllowed }}>{children}</ReflectiveAuthContext.Provider>;
};

export const useReflectiveAuth = () => {
  const context = useContext(ReflectiveAuthContext);
  if (!context) {
    throw new Error('useReflectiveAuth must be used within a ReflectiveAuthProvider');
  }
  return context;
};
