import { createContext, useMemo, type ReactNode, type FC } from 'react';
import { useSafeContext } from '../utils/context';

export interface LayoutProps {
  children?: ReactNode;
  resourceName?: string;
  layoutConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export type LayoutComponent = FC<LayoutProps>;

interface LayoutRegistryValue {
  getLayout: (id: string) => LayoutComponent | undefined;
}

// Global singleton registry shared by the app runtime.
// Register layouts during startup before rendering provider consumers.
const registry = new Map<string, LayoutComponent>();

const LayoutRegistryContext = createContext<LayoutRegistryValue | undefined>(undefined);

/**
 * Register a custom layout component to be used by dynamic resources.
 */
export const registerLayout = (id: string, Component: LayoutComponent) => {
  registry.set(id, Component);
};

/**
 * Provider for the layout registry.
 */
export const LayoutRegistryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const value = useMemo<LayoutRegistryValue>(
    () => ({
      getLayout: (id: string) => registry.get(id),
    }),
    [],
  );

  return <LayoutRegistryContext.Provider value={value}>{children}</LayoutRegistryContext.Provider>;
};

/**
 * Hook to access the layout registry.
 */
export const useLayoutRegistry = (): LayoutRegistryValue => {
  return useSafeContext(LayoutRegistryContext, 'useLayoutRegistry must be used within a LayoutRegistryProvider');
};
