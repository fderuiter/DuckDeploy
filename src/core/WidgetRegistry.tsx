import React, { createContext, useState, useCallback, useContext, lazy } from 'react';
import type { PrecomputedInputDescriptor } from '../components/SchemaToFieldMapper';
import { createRegistry } from './RegistryFactory';

export interface WidgetValueProps {
  source: string;
  value: unknown;
  setValue: (value: unknown) => void;
}

export interface WidgetMetaProps {
  schemaNode: PrecomputedInputDescriptor;
  widgetProps: Record<string, unknown>;
}

export interface WidgetRecordProps {
  record: Record<string, unknown>;
}

export interface WidgetMutationProps {
  mutate: (operation: string, payload?: unknown) => Promise<unknown>;
}

export interface EngineContext extends WidgetValueProps, WidgetMetaProps, WidgetRecordProps, WidgetMutationProps {}

export const WidgetValueContext = createContext<WidgetValueProps | undefined>(undefined);
export const WidgetMetaContext = createContext<WidgetMetaProps | undefined>(undefined);
export const WidgetRecordContext = createContext<WidgetRecordProps | undefined>(undefined);
export const WidgetMutationContext = createContext<WidgetMutationProps | undefined>(undefined);


export interface UseWidgetMutationOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

/**
 * Generated description.
 *
 */
export function useWidgetMutation(options?: UseWidgetMutationOptions): { execute: (operation: string, payload?: unknown) => Promise<unknown>, isLoading: boolean, error: Error | null };
export function useWidgetMutation(mutate: EngineContext['mutate'], options?: UseWidgetMutationOptions): { execute: (operation: string, payload?: unknown) => Promise<unknown>, isLoading: boolean, error: Error | null };
export function useWidgetMutation(
  mutateOrOptions?: EngineContext['mutate'] | UseWidgetMutationOptions,
  options?: UseWidgetMutationOptions
) {
  let mutateFn: EngineContext['mutate'] | undefined;
  let opts: UseWidgetMutationOptions | undefined;

  if (typeof mutateOrOptions === 'function') {
    mutateFn = mutateOrOptions;
    opts = options;
  } else if (mutateOrOptions === undefined && options !== undefined) {
    // This happens if a widget explicitly passes `props.mutate` (which is undefined)
    // and an options object as the second argument.
    opts = options;
  } else {
    opts = mutateOrOptions as UseWidgetMutationOptions | undefined;
  }

  const mutationContext = useContext(WidgetMutationContext);
  const finalMutate = mutateFn || mutationContext?.mutate;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (operation: string, payload?: unknown) => {
      if (!finalMutate) {
        throw new Error('useWidgetMutation must be provided a mutate function or used within a WidgetMutationProvider');
      }
      setIsLoading(true);
      setError(null);
      try {
        const result = await finalMutate(operation, payload);
        if (opts?.onSuccess) opts.onSuccess(result);
        return result;
      } catch (err: any) {
        setError(err);
        if (opts?.onError) opts.onError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [finalMutate, opts]
  );

  return { execute, isLoading, error };
}

export type WidgetComponent = React.FC<any>;

const widgetRegistry = createRegistry<WidgetComponent>('WidgetRegistryProvider');

/**
 * Generated description.
 *
 */
export const registerWidget = widgetRegistry.register;


/**
 * Generated description.
 *
 */
export const WidgetRegistryProvider = widgetRegistry.Provider;

const widgetModules = import.meta.glob([
  '../components/custom/*.tsx',
  '!../components/custom/BaseWidget.tsx'
]);

const customWidgetMap: Record<string, string> = {
  'CustomMapWidget': 'x-ui-custom-map',
  'TerminologyLookupInput': 'cdisc-terminology',
  'FetchUserWidget': 'fetch-user-widget',
};

const toKebabCase = (str: string) =>
  str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

for (const path in widgetModules) {
  const match = path.match(/\/([^/]+)\.tsx$/);
  if (match) {
    const filename = match[1];
    if (filename === 'BaseWidget') {
      continue;
    }

    const widgetId = customWidgetMap[filename] || toKebabCase(filename);
    const loader = widgetModules[path] as () => Promise<any>;
    const LazyComponent = lazy(() =>
      loader().then(module => ({ default: module[filename] || module.default }))
    );
    registerWidget(widgetId, LazyComponent);
  }
}

/**
 * Generated description.
 *
 */
export const useWidgetRegistry = () => {
  const { get } = widgetRegistry.useRegistry();
  return {
    getWidget: (id: string) => {
      const widget = get(id);
      if (!widget) {
        console.warn(`[WidgetRegistry] Missing widget: The requested widget ID "${id}" was not found in the registry.`);
      }
      return widget;
    }
  };
};
