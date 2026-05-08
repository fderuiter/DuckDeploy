import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface EngineContext {
  record: Record<string, unknown>;
  schemaNode: unknown;
  source: string;
  value: unknown;
  setValue: (value: unknown) => void;
  mutate: (operation: string, payload?: unknown) => Promise<unknown>;
}

export type WidgetComponent = React.FC<EngineContext>;

interface WidgetRegistryValue {
  getWidget: (id: string) => WidgetComponent | undefined;
}

// Global singleton registry shared by the app runtime.
// Register widgets during startup before rendering provider consumers.
const registry = new Map<string, WidgetComponent>();

const WidgetRegistryContext = createContext<WidgetRegistryValue | undefined>(undefined);

export const registerWidget = (id: string, Component: WidgetComponent) => {
  registry.set(id, Component);
};

export const WidgetRegistryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const value = useMemo<WidgetRegistryValue>(
    () => ({
      getWidget: (id: string) => registry.get(id),
    }),
    [],
  );

  return <WidgetRegistryContext.Provider value={value}>{children}</WidgetRegistryContext.Provider>;
};

export const useWidgetRegistry = (): WidgetRegistryValue => {
  const context = useContext(WidgetRegistryContext);

  if (!context) {
    throw new Error('useWidgetRegistry must be used within a WidgetRegistryProvider');
  }

  return context;
};
