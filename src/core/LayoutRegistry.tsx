import type { ReactNode, FC } from 'react';
import { createRegistry } from './RegistryFactory';

export interface LayoutProps {
  children?: ReactNode;
  resourceName?: string;
  layoutConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export type LayoutComponent = FC<LayoutProps>;

const layoutRegistry = createRegistry<LayoutComponent>('LayoutRegistryProvider');

/**
 * Register a custom layout component to be used by dynamic resources.
 */
export const registerLayout = layoutRegistry.register;

/**
 * Provider for the layout registry.
 */
export const LayoutRegistryProvider = layoutRegistry.Provider;

/**
 * Hook to access the layout registry.
 */
export const useLayoutRegistry = () => {
  const { get } = layoutRegistry.useRegistry();
  return { getLayout: get };
};
