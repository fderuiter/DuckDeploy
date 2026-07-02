import React, { createContext, useMemo, type ReactNode } from 'react';
import { useSafeContext } from '../utils/context';

/**
 * Centralized factory for component registries.
 * @param providerName The name of the provider.
 * @returns Registration utilities.
 */
export function createRegistry<T>(providerName: string) {
  const registry = new Map<string, T>();
  const RegistryContext = createContext<{ get: (id: string) => T | undefined } | undefined>(undefined);

  const register = (id: string, Component: T) => {
    registry.set(id, Component);
  };

  const Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const value = useMemo(() => ({ get: (id: string) => registry.get(id) }), []);
    return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
  };

  const useRegistry = () => {
    return useSafeContext(RegistryContext, `useRegistry must be used within a ${providerName}`);
  };

  return { register, Provider, useRegistry };
}
