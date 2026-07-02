import React, { createContext, useState, useCallback, useContext } from 'react';
import { useSafeContext } from '../utils/context';
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

export const WidgetValueContext = createContext<WidgetValueProps | undefined>(undefined);
export const WidgetMetaContext = createContext<WidgetMetaProps | undefined>(undefined);
export const WidgetRecordContext = createContext<WidgetRecordProps | undefined>(undefined);
export const WidgetMutationContext = createContext<WidgetMutationProps | undefined>(undefined);

/**
 * Hook to access widget value props.
 */
export const useWidgetValue = () => useSafeContext(WidgetValueContext, 'useWidgetValue must be used within a WidgetValueProvider');

/**
 * Hook to access widget metadata props.
 */
export const useWidgetMeta = () => useSafeContext(WidgetMetaContext, 'useWidgetMeta must be used within a WidgetMetaProvider');

/**
 * Hook to access widget record props.
 */
export const useWidgetRecord = () => useSafeContext(WidgetRecordContext, 'useWidgetRecord must be used within a WidgetRecordProvider');

export interface UseWidgetMutationOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

/**
 * Generated description.
 *
 */
export function useWidgetMutation(options?: UseWidgetMutationOptions): { execute: (operation: string, payload?: unknown) => Promise<unknown>, isLoading: boolean, error: Error | null };
export function useWidgetMutation(mutate: WidgetMutationProps['mutate'], options?: UseWidgetMutationOptions): { execute: (operation: string, payload?: unknown) => Promise<unknown>, isLoading: boolean, error: Error | null };
export function useWidgetMutation(
  mutateOrOptions?: WidgetMutationProps['mutate'] | UseWidgetMutationOptions,
  options?: UseWidgetMutationOptions
) {
  let mutateFn: WidgetMutationProps['mutate'] | undefined;
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

/**
 * Generated description.
 *
 */
export const useWidgetRegistry = () => {
  const { get } = widgetRegistry.useRegistry();
  return { getWidget: get };
};
