import { SelectInput, required } from 'react-admin';
import { OpenAPIV3 } from 'openapi-types';
import { useEffect, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { mapSchemaToInput } from './SchemaToFieldMapper';
import { resetPolymorphicValue } from './polymorphicState';

export const PolymorphicInput = ({
  source,
  schemas,
  isRequired,
  depth = 0,
  discriminatorProperty,
  discriminatorValues
}: {
  source: string,
  schemas: OpenAPIV3.SchemaObject[],
  isRequired: boolean,
  depth?: number,
  discriminatorProperty?: string,
  discriminatorValues?: Array<string | undefined>
}) => {
  const form = useFormContext();
  const { control, getValues, unregister, setValue } = form;
  // Create dropdown choices based on schema titles or types
  const choices = schemas.map((s, index) => ({
    id: index,
    name: s.title || `Option ${index + 1} (${s.type})`
  }));

  // We use a hidden meta-field to track which schema the user selected
  const typeSource = `${source}__schemaIndex`;
  const selectedIndexRaw = useWatch({ control, name: typeSource });
  const selectedIndex =
    selectedIndexRaw === undefined || selectedIndexRaw === null
      ? undefined
      : Number.parseInt(String(selectedIndexRaw), 10);
  const selectedDiscriminatorValue =
    selectedIndex === undefined || Number.isNaN(selectedIndex) ? undefined : discriminatorValues?.[selectedIndex];
  const previousSelectedIndexRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (selectedIndex === undefined || Number.isNaN(selectedIndex)) return;
    const previousSelectedIndex = previousSelectedIndexRef.current;
    if (previousSelectedIndex !== undefined && previousSelectedIndex !== selectedIndex) {
      resetPolymorphicValue(unregister, setValue, source, discriminatorProperty, selectedDiscriminatorValue);
      previousSelectedIndexRef.current = selectedIndex;
      return;
    }

    const selectedSchema = schemas[selectedIndex];
    const allowedKeys =
      selectedSchema?.type === 'object' && selectedSchema.properties
        ? new Set(Object.keys(selectedSchema.properties))
        : null;
    const currentValue = getValues(source);
    if (currentValue !== null && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      const cleanedValue = Object.entries(currentValue as Record<string, unknown>).reduce<Record<string, unknown>>(
        (acc, [key, value]) => {
          if (key.endsWith('__schemaIndex')) return acc;
          if (allowedKeys && !allowedKeys.has(key)) return acc;
          acc[key] = value;
          return acc;
        },
        {},
      );

      if (discriminatorProperty && selectedDiscriminatorValue !== undefined) {
        cleanedValue[discriminatorProperty] = selectedDiscriminatorValue;
      }

      if (JSON.stringify(currentValue) !== JSON.stringify(cleanedValue)) {
        setValue(source, cleanedValue, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    } else if (discriminatorProperty && selectedDiscriminatorValue !== undefined) {
      setValue(
        source,
        { [discriminatorProperty]: selectedDiscriminatorValue },
        {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        },
      );
    }

    previousSelectedIndexRef.current = selectedIndex;
  }, [discriminatorProperty, getValues, schemas, selectedDiscriminatorValue, selectedIndex, source, unregister, setValue]);

  return (
    <div style={{ padding: '1rem', border: '1px dashed #ccc' }}>
      <SelectInput
        source={typeSource}
        choices={choices}
        label="Select Type"
        validate={isRequired ? [required()] : []}
      />
      {selectedIndex === undefined || Number.isNaN(selectedIndex)
        ? null
        : mapSchemaToInput(source, schemas[selectedIndex], isRequired, depth)}
    </div>
  );
};
