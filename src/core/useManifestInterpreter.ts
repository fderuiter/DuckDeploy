import { useMemo } from 'react';
import { useSpec } from './SpecContext';
import { useLayoutRegistry } from './LayoutRegistry';
import { useResourceContext } from 'react-admin';

export type UiMode = 'list' | 'create' | 'edit' | 'show';

export interface UseManifestInterpreterOptions {
  resource?: string;
  mode?: UiMode;
}

/**
 * Centralized Manifest Interpreter Engine
 * Resolves resource names and standardizes layout configuration from the UI manifest.
 */
export const useManifestInterpreter = (options: UseManifestInterpreterOptions = {}) => {
  const { uiManifest, spec } = useSpec();
  const { getLayout } = useLayoutRegistry();
  const resourceContext = useResourceContext();

  const resourceName = options.resource || resourceContext || '';

  return useMemo(() => {
    const precomputedResource = uiManifest?.resources?.[resourceName];
    const specSchema = spec?.components?.schemas?.[resourceName];
    
    // Fallbacks based on specific-then-generic layout prioritization
    let layoutId;
    let layoutConfig;

    if (options.mode === 'create') {
      layoutId = precomputedResource?.createLayout || precomputedResource?.layout;
      layoutConfig = precomputedResource?.createLayoutConfig || precomputedResource?.layoutConfig;
    } else if (options.mode === 'edit') {
      layoutId = precomputedResource?.editLayout || precomputedResource?.layout;
      layoutConfig = precomputedResource?.editLayoutConfig || precomputedResource?.layoutConfig;
    } else if (options.mode === 'list') {
      layoutId = precomputedResource?.listLayout || precomputedResource?.layout;
      layoutConfig = precomputedResource?.listLayoutConfig || precomputedResource?.layoutConfig;
    } else if (options.mode === 'show') {
      layoutId = precomputedResource?.showLayout || precomputedResource?.layout;
      layoutConfig = precomputedResource?.showLayoutConfig || precomputedResource?.layoutConfig;
    } else {
      layoutId = precomputedResource?.layout;
      layoutConfig = precomputedResource?.layoutConfig;
    }

    const CustomLayout = layoutId ? getLayout(layoutId) : undefined;
    
    return {
      resourceName,
      precomputedResource,
      layoutId,
      layoutConfig,
      CustomLayout,
      specSchema
    };
  }, [uiManifest, spec, resourceName, options.mode, getLayout]);
};
