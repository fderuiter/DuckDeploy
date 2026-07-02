import React from 'react';
import { useDataProvider } from 'react-admin';
import { useAccessibility } from './AccessibilityContext';
import { useWidgetRegistry } from './WidgetRegistry';

/**
 * Tracker for missing metadata to warn users.
 * @returns Null.
 */
export const MetadataTracker = ({ source, missingType }: { source: string, missingType: 'title' | 'description' }) => {
  const { trackMissingMetadata } = useAccessibility();
  React.useEffect(() => {
    if (source) trackMissingMetadata(source, missingType);
  }, [source, missingType, trackMissingMetadata]);
  return null;
};

/**
 * Provides a shared data mutation service for standard and custom widgets.
 * @returns The mutation function.
 */
export const useSharedMutationService = () => {
  const dataProvider = useDataProvider();

  return async (operation: string, payload?: any) => {
    const dp = dataProvider as any;
    if (typeof dp[operation] !== 'function') {
      throw new Error(`Data provider does not support operation: ${operation}`);
    }
    
    if (payload && typeof payload === 'object' && 'resource' in payload) {
      const { resource, params } = payload;
      return dp[operation](resource, params || payload);
    }
    
    return dp[operation](payload);
  };
};

/**
 * Builds common accessibility and mapping props for fields/inputs.
 * @returns React props.
 */
export const buildCommonProps = ({
  source,
  title,
  description,
  isRequired,
  key,
  validators,
}: {
  source: string;
  title?: string;
  description?: string;
  isRequired?: boolean;
  key?: string;
  validators?: any;
}) => {
  const props: any = {
    key: key || source,
    source,
    label: title,
  };
  if (description) {
    props['aria-description'] = description;
  }
  if (validators) {
    props.validate = validators;
  }
  if (isRequired !== undefined) {
    props.isRequired = isRequired;
  }
  return props;
};

/**
 * Builds tracker nodes for heuristic property tracking.
 * @param source Field path.
 * @param isHeuristicTitle Was the title generated.
 * @param description Description string.
 * @returns React fragments for tracking.
 */
export const buildTrackerNodes = (source: string, isHeuristicTitle: boolean, description?: string) => {
  return (
    <React.Fragment>
      {isHeuristicTitle && <MetadataTracker source={source} missingType="title" />}
      {!description && <MetadataTracker source={source} missingType="description" />}
    </React.Fragment>
  );
};

/**
 * Resolves fields and inputs from widget registry or default component factory.
 * @param ComponentMappingFactory Mapping factory.
 * @returns Resolver functions.
 */
export const useComponentResolver = (ComponentMappingFactory: Record<string, { Field: React.FC<any>, Input: React.FC<any> }>) => {
  const { getWidget } = useWidgetRegistry();
  
  return {
    resolveField: (kind: string, candidateId?: string, fallbackId?: string) => {
      const Widget = [candidateId, fallbackId].find(id => Boolean(id) && Boolean(getWidget(id as string)));
      if (Widget) return getWidget(Widget);

      const ComponentDef = ComponentMappingFactory[kind];
      return ComponentDef ? ComponentDef.Field : null;
    },
    resolveInput: (kind: string, candidateId?: string, fallbackId?: string) => {
      const Widget = [candidateId, fallbackId].find(id => Boolean(id) && Boolean(getWidget(id as string)));
      if (Widget) return getWidget(Widget);

      const ComponentDef = ComponentMappingFactory[kind];
      return ComponentDef ? ComponentDef.Input : null;
    }
  };
};
