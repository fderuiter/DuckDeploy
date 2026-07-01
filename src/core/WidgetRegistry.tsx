import { createContext, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useSafeContext } from '../utils/context';
import type { PrecomputedInputDescriptor } from '../components/SchemaToFieldMapper';

export interface EngineContext {
  record: Record<string, unknown>;
  schemaNode: PrecomputedInputDescriptor;
  source: string;
  value: unknown;
  widgetProps: Record<string, unknown>;
  setValue: (value: unknown) => void;
  mutate: (operation: string, payload?: unknown) => Promise<unknown>;
}

export interface UseWidgetMutationOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

export const useWidgetMutation = (
  mutate: EngineContext['mutate'],
  options?: UseWidgetMutationOptions
) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (operation: string, payload?: unknown) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await mutate(operation, payload);
        if (options?.onSuccess) options.onSuccess(result);
        return result;
      } catch (err: any) {
        setError(err);
        if (options?.onError) options.onError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [mutate, options]
  );

  return { execute, isLoading, error };
};

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
  return useSafeContext(WidgetRegistryContext, 'useWidgetRegistry must be used within a WidgetRegistryProvider');
};
