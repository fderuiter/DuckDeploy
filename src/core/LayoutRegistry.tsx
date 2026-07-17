import { lazy, type ReactNode, type FC } from 'react';
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

const layoutModules = import.meta.glob([
  '../layouts/*.tsx',
  '!../layouts/FormLayoutContext.tsx',
  '!../layouts/StandardLayout.tsx'
]);

for (const path in layoutModules) {
  const match = path.match(/\/([^/]+)\.tsx$/);
  if (match) {
    const filename = match[1];
    if (filename === 'FormLayoutContext' || filename === 'StandardLayout') {
      continue;
    }

    const loader = layoutModules[path] as () => Promise<any>;
    const LazyComponent = lazy(() =>
      loader().then(module => ({ default: module[filename] || module.default }))
    );
    registerLayout(filename, LazyComponent);
  }
}

/**
 * Hook to access the layout registry.
 */
export const useLayoutRegistry = () => {
  const { get } = layoutRegistry.useRegistry();
  return {
    getLayout: (id: string) => {
      const layout = get(id);
      if (!layout) {
        console.warn(`[LayoutRegistry] Missing layout: The requested layout ID "${id}" was not found in the registry.`);
      }
      return layout;
    }
  };
};
