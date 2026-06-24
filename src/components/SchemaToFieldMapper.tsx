import {
  TextField,
  DateField,
  BooleanField,
  NumberField,
  ReferenceField,
  SelectField,
  TextInput,
  DateInput,
  BooleanInput,
  NumberInput,
  ReferenceInput,
  SelectInput,
  ArrayField,
  SingleFieldList,
  ChipField,
  ArrayInput,
  SimpleFormIterator,
  required,
} from 'react-admin';
import { createElement, useEffect, useRef } from 'react';
import type { OpenAPIV3 } from 'openapi-types';
import { useFormContext, useWatch } from 'react-hook-form';
import { buildValidators } from './validators';
import { PolymorphicInput } from './PolymorphicInput';
import { useWidgetRegistry } from '../core/WidgetRegistry';
import {
  areShallowObjectsEqual,
  cleanupPolymorphicObjectValue,
  resetPolymorphicValue,
  setPolymorphicDiscriminatorValue,
} from './polymorphicState';
import {
  determineSchemaKindForField,
  determineSchemaKindForInput,
  getReferenceTarget,
  getWidgetId,
  getWidgetProps,
  resolveFallbackWidgetId,
} from '../utils/heuristics';

type ValidationDescriptor = {
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
};

export type PrecomputedFieldDescriptor = {
  kind: 'reference' | 'enum' | 'boolean' | 'number' | 'date' | 'text' | 'array';
  source: string;
  description?: string;
  widgetId?: string;
  reference?: string;
  choices?: Array<{ id: string; name: string }>;
};

export type PrecomputedInputDescriptor = {
  kind:
    | 'polymorphic'
    | 'object'
    | 'array'
    | 'reference'
    | 'enum'
    | 'boolean'
    | 'number'
    | 'date'
    | 'text';
  source: string;
  isRequired: boolean;
  title?: string;
  description?: string;
  widgetId?: string;
  widgetProps?: Record<string, unknown>;
  uiExtensions?: Record<string, unknown>;
  discriminatorProperty?: string;
  reference?: string;
  choices?: Array<{ id: string; name: string }>;
  options?: Array<{ label: string; discriminatorValue?: string; node: PrecomputedInputDescriptor }>;
  children?: PrecomputedInputDescriptor[];
  items?: PrecomputedInputDescriptor[];
  validation?: ValidationDescriptor;
};

const toDiscriminatorValue = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;

const resolveDiscriminatorMetadata = (
  property: OpenAPIV3.SchemaObject,
  schemas: OpenAPIV3.SchemaObject[],
): { propertyName: string; values: Array<string | undefined> } | undefined => {
  const discriminator = property.discriminator;
  const propertyName =
    typeof discriminator?.propertyName === 'string' && discriminator.propertyName.trim().length > 0
      ? discriminator.propertyName
      : undefined;

  if (!propertyName) {
    return undefined;
  }

  const values = schemas.map((schema) => {
    const discriminatorProperty = schema.properties?.[propertyName];
    if (!discriminatorProperty || '$ref' in discriminatorProperty) {
      return undefined;
    }

    const constValue = toDiscriminatorValue(discriminatorProperty.const);
    if (constValue !== undefined) {
      return constValue;
    }

    if (Array.isArray(discriminatorProperty.enum) && discriminatorProperty.enum.length === 1) {
      return toDiscriminatorValue(discriminatorProperty.enum[0]);
    }

    return undefined;
  });

  return { propertyName, values };
};

const buildValidatorsFromDescriptor = (descriptor: PrecomputedInputDescriptor) => {
  const validation = descriptor.validation || {};
  const schemaForValidation = {
    minLength: validation.minLength,
    maxLength: validation.maxLength,
    minimum: validation.minimum,
    maximum: validation.maximum,
    pattern: validation.pattern,
  } as OpenAPIV3.SchemaObject;

  return buildValidators(schemaForValidation, descriptor.isRequired);
};

type WidgetOverrideInputProps = {
  source: string;
  candidateWidgetId?: string;
  fallbackWidgetId?: string;
  widgetProps?: Record<string, unknown>;
  schemaNode: unknown;
  fallback: React.ReactNode;
};

const WidgetOverrideInput = ({
  source,
  candidateWidgetId,
  fallbackWidgetId,
  widgetProps,
  schemaNode,
  fallback,
}: WidgetOverrideInputProps) => {
  const { getWidget } = useWidgetRegistry();
  const form = useFormContext();

  const widgetId = resolveFallbackWidgetId(candidateWidgetId, fallbackWidgetId) && [candidateWidgetId, fallbackWidgetId].find((candidate) => Boolean(candidate) && Boolean(getWidget(candidate)));
  const Widget = widgetId ? getWidget(widgetId) : undefined;

  const value = useWatch({ control: form.control, name: source });

  if (!Widget || !source) {
    return <>{fallback}</>;
  }

  return createElement(Widget, {
    record: (form.getValues() as Record<string, unknown>) ?? {},
    schemaNode,
    source,
    value,
    widgetProps: widgetProps || {},
    setValue: (nextValue) => {
      form.setValue(source, nextValue, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    mutate: async (operation) => {
      console.warn(`Widget mutate('${operation}') was called without a bound mutation handler.`);
      return undefined;
    },
  });
};

const PrecomputedPolymorphicInput = ({
  node,
  keyPrefix,
}: {
  node: PrecomputedInputDescriptor;
  keyPrefix: string;
}) => {
  const form = useFormContext();
  const { control, unregister, setValue } = form;
  const typeSource = `${node.source}__schemaIndex`;
  const selectedIndexRaw = useWatch({ control, name: typeSource });
  const selectedIndex =
    selectedIndexRaw === undefined || selectedIndexRaw === null
      ? undefined
      : Number.parseInt(String(selectedIndexRaw), 10);
  const previousSelectedIndexRef = useRef<number | undefined>(undefined);
  const choices = (node.options || []).map((option, index) => ({ id: index, name: option.label || `Option ${index + 1}` }));
  const selectedDiscriminatorValue =
    selectedIndex === undefined || Number.isNaN(selectedIndex) ? undefined : node.options?.[selectedIndex]?.discriminatorValue;

  useEffect(() => {
    if (selectedIndex === undefined || Number.isNaN(selectedIndex)) return;
    const previousSelectedIndex = previousSelectedIndexRef.current;
    if (previousSelectedIndex !== undefined && previousSelectedIndex !== selectedIndex) {
      resetPolymorphicValue(unregister, setValue, node.source, node.discriminatorProperty, selectedDiscriminatorValue);
      previousSelectedIndexRef.current = selectedIndex;
      return;
    }

    const selectedNode = node.options?.[selectedIndex]?.node;
    const allowedKeys =
      selectedNode?.kind === 'object'
        ? new Set(
            (selectedNode.children || [])
              .map((child) => child.source.split('.').pop())
              .filter((key): key is string => Boolean(key)),
          )
        : null;
    const currentValue = form.getValues(node.source);
    if (currentValue !== null && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      const cleanedValue = cleanupPolymorphicObjectValue(
        currentValue as Record<string, unknown>,
        allowedKeys,
        node.discriminatorProperty,
        selectedDiscriminatorValue,
      );

      if (!areShallowObjectsEqual(currentValue as Record<string, unknown>, cleanedValue)) {
        setValue(node.source, cleanedValue, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
    } else {
      setPolymorphicDiscriminatorValue(setValue, node.source, node.discriminatorProperty, selectedDiscriminatorValue);
    }

    previousSelectedIndexRef.current = selectedIndex;
  }, [form, node.discriminatorProperty, node.options, node.source, selectedDiscriminatorValue, selectedIndex, unregister, setValue]);

  return (
    <div key={keyPrefix} style={{ padding: '1rem', border: '1px dashed #ccc' }}>
      <SelectInput
        source={typeSource}
        choices={choices}
        label="Select Type"
        validate={node.isRequired ? [required()] : []}
      />

      {selectedIndex === undefined || Number.isNaN(selectedIndex)
        ? null
        : (() => {
            const selectedNode = node.options?.[selectedIndex]?.node;
            if (!selectedNode) return null;
            return renderPrecomputedInput(selectedNode, `${keyPrefix}.${selectedIndex}`);
          })()}
    </div>
  );
};

export const renderPrecomputedField = (
  node: PrecomputedFieldDescriptor,
  keyPrefix: string = node.source,
): React.ReactNode => {
  const key = keyPrefix || node.source || 'field';

  if (node.kind === 'reference') {
    const reference = node.reference || node.source;
    return (
      <ReferenceField key={key} source={node.source} reference={reference}>
        <TextField source="id" />
      </ReferenceField>
    );
  }

  if (node.kind === 'enum') {
    return <SelectField key={key} source={node.source} choices={node.choices || []} />;
  }

  if (node.kind === 'boolean') {
    return <BooleanField key={key} source={node.source} />;
  }

  if (node.kind === 'number') {
    return <NumberField key={key} source={node.source} />;
  }

  if (node.kind === 'date') {
    return <DateField key={key} source={node.source} />;
  }

  if (node.kind === 'array') {
    return (
      <ArrayField key={key} source={node.source}>
        <SingleFieldList>
          <ChipField source="id" />
        </SingleFieldList>
      </ArrayField>
    );
  }

  return <TextField key={key} source={node.source} />;
};

const renderPrecomputedInputDefault = (
  node: PrecomputedInputDescriptor,
  keyPrefix: string = node.source,
): React.ReactNode => {
  const validators = buildValidatorsFromDescriptor(node);
  const key = keyPrefix || node.source || 'input';
  const commonProps: any = {
    key,
    source: node.source,
    validate: validators,
    isRequired: node.isRequired,
  };
  if (node.description) {
    commonProps['aria-description'] = node.description;
  }

  if (node.kind === 'polymorphic' && node.options && node.options.length > 0) {
    return <PrecomputedPolymorphicInput node={node} keyPrefix={key} />;
  }

  if (node.kind === 'object') {
    return (
      <div key={key} style={{ marginLeft: '1rem', borderLeft: '2px solid #eee', paddingLeft: '1rem' }}>
        <h4>{node.title || node.source.split('.').pop() || node.source}</h4>
        {(node.children || []).map((child, index) => renderPrecomputedInput(child, `${key}.${child.source || index}`))}
      </div>
    );
  }

  if (node.kind === 'array') {
    return (
      <ArrayInput {...commonProps}>
        <SimpleFormIterator inline>
          {(node.items || []).map((item, index) => renderPrecomputedInput(item, `${key}.item.${index}`))}
        </SimpleFormIterator>
      </ArrayInput>
    );
  }

  if (node.kind === 'reference') {
    const reference = node.reference || node.source.replace(/_id$/i, '').replace(/Id$/, '');
    return (
      <ReferenceInput {...commonProps} reference={reference}>
        <SelectInput optionText="id" />
      </ReferenceInput>
    );
  }

  if (node.kind === 'enum') {
    return <SelectInput {...commonProps} choices={node.choices || []} />;
  }

  if (node.kind === 'boolean') {
    return <BooleanInput {...commonProps} />;
  }

  if (node.kind === 'number') {
    return <NumberInput {...commonProps} />;
  }

  if (node.kind === 'date') {
    return <DateInput {...commonProps} />;
  }

  return <TextInput {...commonProps} />;
};

export const renderPrecomputedInput = (
  node: PrecomputedInputDescriptor,
  keyPrefix: string = node.source,
): React.ReactNode => {
  const fallback = renderPrecomputedInputDefault(node, keyPrefix);
  const widgetId = typeof node.widgetId === 'string' ? node.widgetId : undefined;

  return (
    <WidgetOverrideInput
      source={node.source}
      candidateWidgetId={widgetId}
      fallbackWidgetId={node.source}
      widgetProps={node.widgetProps}
      schemaNode={node}
      fallback={fallback}
    />
  );
};

export const mapSchemaToField = (name: string, property: any) => {
  const kind = determineSchemaKindForField(name, property);

  if (kind === 'reference') {
    const target = getReferenceTarget(name);
    return (
      <ReferenceField key={name} source={name} reference={target}>
        <TextField source="id" />
      </ReferenceField>
    );
  }

  if (kind === 'enum') {
    const choices = property.enum.map((val: string) => ({ id: val, name: val }));
    return <SelectField key={name} source={name} choices={choices} />;
  }

  if (kind === 'boolean') {
    return <BooleanField key={name} source={name} />;
  }

  if (kind === 'number') {
    return <NumberField key={name} source={name} />;
  }

  if (kind === 'date') {
    return <DateField key={name} source={name} />;
  }

  if (kind === 'array') {
    return (
      <ArrayField key={name} source={name}>
        <SingleFieldList>
          <ChipField source="id" />
        </SingleFieldList>
      </ArrayField>
    );
  }

  return <TextField key={name} source={name} />;
};

const mapSchemaToInputDefault = (
  source: string,
  property: OpenAPIV3.SchemaObject,
  isRequired: boolean,
  depth: number = 0,
): React.ReactNode => {
  if (depth > 5) return null; // Infinite recursion guard

  const validators = buildValidators(property, isRequired);
  const commonProps: any = {
    key: source,
    source,
    validate: validators,
    isRequired, // Needed for simple reference/boolean inputs to display asterisk
  };
  if (property.description) {
    commonProps['aria-description'] = property.description;
  }

  const kind = determineSchemaKindForInput(source, property);

  // Polymorphism
  if (kind === 'polymorphic') {
    const schemas = (property.oneOf || property.anyOf) as OpenAPIV3.SchemaObject[];
    const discriminatorMetadata = resolveDiscriminatorMetadata(property, schemas);
    return (
      <PolymorphicInput
        key={source}
        source={source}
        schemas={schemas}
        isRequired={isRequired}
        depth={depth + 1}
        discriminatorProperty={discriminatorMetadata?.propertyName}
        discriminatorValues={discriminatorMetadata?.values}
      />
    );
  }

  // Nested Objects
  if (kind === 'object' && property.properties) {
    return (
      <div key={source} style={{ marginLeft: '1rem', borderLeft: '2px solid #eee', paddingLeft: '1rem' }}>
        <h4>{property.title || source.split('.').pop() || source}</h4>
        {Object.entries(property.properties).map(([subName, subProp]) => {
          const nestedSource = source ? `${source}.${subName}` : subName;
          return mapSchemaToInput(
            nestedSource,
            subProp as OpenAPIV3.SchemaObject,
            (property.required || []).includes(subName),
            depth + 1,
          );
        })}
      </div>
    );
  }

  // Arrays
  if (kind === 'array' && property.items) {
    const itemSchema = property.items as OpenAPIV3.SchemaObject;

    return (
      <ArrayInput {...commonProps}>
        <SimpleFormIterator inline>
          {itemSchema.type === 'object' && itemSchema.properties
            ? Object.entries(itemSchema.properties).map(([subName, subProp]) =>
                mapSchemaToInput(
                  subName,
                  subProp as OpenAPIV3.SchemaObject,
                  (itemSchema.required || []).includes(subName),
                  depth + 1,
                ),
              )
            : mapSchemaToInput('', itemSchema, false, depth + 1)}
        </SimpleFormIterator>
      </ArrayInput>
    );
  }

  if (kind === 'reference') {
    const target = getReferenceTarget(source);
    return (
      <ReferenceInput {...commonProps} reference={target}>
        <SelectInput optionText="id" />
      </ReferenceInput>
    );
  }

  if (kind === 'enum') {
    const choices = property.enum!.map((val: string) => ({ id: val, name: val }));
    return <SelectInput {...commonProps} choices={choices} />;
  }

  if (kind === 'boolean') {
    return <BooleanInput {...commonProps} />;
  }

  if (kind === 'number') {
    return <NumberInput {...commonProps} />;
  }

  if (kind === 'date') {
    return <DateInput {...commonProps} />;
  }

  return <TextInput {...commonProps} />;
};

export const mapSchemaToInput = (
  source: string,
  property: OpenAPIV3.SchemaObject,
  isRequired: boolean,
  depth: number = 0,
): React.ReactNode => {
  const fallback = mapSchemaToInputDefault(source, property, isRequired, depth);
  const explicitWidgetId = getWidgetId(property);
  const widgetProps = getWidgetProps(property) || {};

  return (
    <WidgetOverrideInput
      source={source}
      candidateWidgetId={explicitWidgetId}
      fallbackWidgetId={source}
      widgetProps={widgetProps}
      schemaNode={property}
      fallback={fallback}
    />
  );
};
