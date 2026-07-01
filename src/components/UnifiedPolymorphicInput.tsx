import { SelectInput, required } from 'react-admin';
import { useEffect, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { renderInput } from './SchemaToFieldMapper';
import {
  areShallowObjectsEqual,
  cleanupPolymorphicObjectValue,
  resetPolymorphicValue,
  setPolymorphicDiscriminatorValue,
} from './polymorphicState';
import { SCHEMA_SELECTION_KEY } from '@duckdeploy/openapi';
import type { PrecomputedInputDescriptor } from './SchemaToFieldMapper';
import type { OpenAPIV3 } from 'openapi-types';
import { DeclarativeA11yContainer } from './DeclarativeA11yContainer';

/**
 * Generated description.
 *
 */
export const UnifiedPolymorphicInput = ({
  source,
  options,
  discriminatorProperty,
  isRequired,
  depth = 0,
  keyPrefix,
}: {
  source: string,
  options: Array<{ label: string; discriminatorValue?: string; node: any }>,
  discriminatorProperty?: string,
  isRequired: boolean,
  depth?: number,
  keyPrefix: string,
}) => {
  const form = useFormContext();
  const { control, getValues, unregister, setValue } = form;
  
  const choices = options.map((opt, index) => ({
    id: index,
    name: opt.label || `Option ${index + 1}`
  }));

  const typeSource = `${source}${SCHEMA_SELECTION_KEY}`;
  const selectedIndexRaw = useWatch({ control, name: typeSource });
  const selectedIndex =
    selectedIndexRaw === undefined || selectedIndexRaw === null
      ? undefined
      : Number.parseInt(String(selectedIndexRaw), 10);
      
  const selectedDiscriminatorValue =
    selectedIndex === undefined || Number.isNaN(selectedIndex) ? undefined : options[selectedIndex]?.discriminatorValue;
    
  const previousSelectedIndexRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (selectedIndex === undefined || Number.isNaN(selectedIndex)) return;
    const previousSelectedIndex = previousSelectedIndexRef.current;
    if (previousSelectedIndex !== undefined && previousSelectedIndex !== selectedIndex) {
      resetPolymorphicValue(unregister, setValue, source, discriminatorProperty, selectedDiscriminatorValue);
      previousSelectedIndexRef.current = selectedIndex;
      return;
    }

    const selectedNode = options[selectedIndex]?.node;
    const isPrecomputed = selectedNode && 'kind' in selectedNode && 'source' in selectedNode;
    
    let allowedKeys: Set<string> | null = null;
    
    if (isPrecomputed) {
      const pNode = selectedNode as PrecomputedInputDescriptor;
      if (pNode.kind === 'object') {
        allowedKeys = new Set(
          (pNode.children || [])
            .map((child) => child.source.split('.').pop())
            .filter((key): key is string => Boolean(key))
        );
      }
    } else {
      const sNode = selectedNode as OpenAPIV3.SchemaObject;
      if (sNode?.type === 'object' && sNode.properties) {
        allowedKeys = new Set(Object.keys(sNode.properties));
      }
    }
    
    const currentValue = getValues(source);
    if (currentValue !== null && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      const cleanedValue = cleanupPolymorphicObjectValue(
        currentValue as Record<string, unknown>,
        allowedKeys,
        discriminatorProperty,
        selectedDiscriminatorValue,
      );

      if (!areShallowObjectsEqual(currentValue as Record<string, unknown>, cleanedValue)) {
        setValue(source, cleanedValue, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    } else {
      setPolymorphicDiscriminatorValue(setValue, source, discriminatorProperty, selectedDiscriminatorValue);
    }

    previousSelectedIndexRef.current = selectedIndex;
  }, [discriminatorProperty, getValues, options, selectedDiscriminatorValue, selectedIndex, source, unregister, setValue]);

  return (
    <DeclarativeA11yContainer
      dependency={selectedIndex}
      announcement={`Form structure updated for ${choices[selectedIndex ?? 0]?.name || 'new selection'}.`}
      focusTarget="[data-polymorphic-content] input:not([type='hidden']):not([disabled]), [data-polymorphic-content] select:not([disabled]), [data-polymorphic-content] textarea:not([disabled]), [data-polymorphic-content] button:not([disabled])"
    >
      <div key={keyPrefix} style={{ padding: '1rem', border: '1px dashed #ccc' }}>
        <SelectInput
          source={typeSource}
          choices={choices}
          label="Select Type"
          validate={isRequired ? [required()] : []}
        />
        {selectedIndex === undefined || Number.isNaN(selectedIndex) ? null : (
          <div data-polymorphic-content="true">
            {renderInput(options[selectedIndex].node, source, isRequired, depth, `${keyPrefix}.${selectedIndex}`)}
          </div>
        )}
      </div>
    </DeclarativeA11yContainer>
  );
};
