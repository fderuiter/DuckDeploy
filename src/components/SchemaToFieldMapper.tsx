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
  FormDataConsumer,
  required,
} from 'react-admin';
import { createElement } from 'react';
import { get } from 'lodash';
import { OpenAPIV3 } from 'openapi-types';
import { useFormContext, useWatch } from 'react-hook-form';
import { buildValidators } from './validators';
import { PolymorphicInput } from './PolymorphicInput';
import { JsonEditorInput } from './custom/JsonEditorInput';
import { TerminologyLookupInput } from './custom/TerminologyLookupInput';
import { useWidgetRegistry } from '../core/WidgetRegistry';

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
  widgetId?: string;
  reference?: string;
  choices?: Array<{ id: string; name: string }>;
};

export type PrecomputedInputDescriptor = {
  kind:
    | 'custom_json_editor'
    | 'custom_terminology_lookup'
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
  domain?: string;
  widgetId?: string;
  reference?: string;
  choices?: Array<{ id: string; name: string }>;
  options?: Array<{ label: string; node: PrecomputedInputDescriptor }>;
  children?: PrecomputedInputDescriptor[];
  items?: PrecomputedInputDescriptor[];
  validation?: ValidationDescriptor;
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
  candidates: string[];
  schemaNode: unknown;
  fallback: React.ReactNode;
};

const WidgetOverrideInput = ({ source, candidates, schemaNode, fallback }: WidgetOverrideInputProps) => {
  const { getWidget } = useWidgetRegistry();
  const form = useFormContext();

  const widgetId = candidates.find((candidate) => Boolean(candidate) && Boolean(getWidget(candidate)));
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
  const commonProps = {
    key,
    source: node.source,
    validate: validators,
    isRequired: node.isRequired,
  };

  if (node.kind === 'custom_json_editor') {
    return <JsonEditorInput {...commonProps} />;
  }

  if (node.kind === 'custom_terminology_lookup') {
    return <TerminologyLookupInput {...commonProps} domain={node.domain} />;
  }

  if (node.kind === 'polymorphic' && node.options && node.options.length > 0) {
    const typeSource = `${node.source}__schemaIndex`;
    const choices = node.options.map((option, index) => ({ id: index, name: option.label || `Option ${index + 1}` }));

    return (
      <div key={key} style={{ padding: '1rem', border: '1px dashed #ccc' }}>
        <SelectInput
          source={typeSource}
          choices={choices}
          label="Select Type"
          validate={node.isRequired ? [required()] : []}
        />

        <FormDataConsumer>
          {({ formData }) => {
            const selectedIndex = get(formData, typeSource);
            if (selectedIndex === undefined) return null;
            const selectedNode = node.options?.[selectedIndex]?.node;
            if (!selectedNode) return null;
            return renderPrecomputedInput(selectedNode, `${key}.${selectedIndex}`);
          }}
        </FormDataConsumer>
      </div>
    );
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
  const candidates = [node.widgetId, node.source].filter(Boolean) as string[];

  if (candidates.length === 0) {
    return fallback;
  }

  return (
    <WidgetOverrideInput
      source={node.source}
      candidates={candidates}
      schemaNode={node}
      fallback={fallback}
    />
  );
};

export const mapSchemaToField = (name: string, property: any) => {
  // Check for reference
  if (name.endsWith('_id') || name.endsWith('Id') || property.$ref) {
    const target = name.replace(/_id$/i, '').replace(/Id$/, '');
    return (
      <ReferenceField key={name} source={name} reference={target}>
        <TextField source="id" />
      </ReferenceField>
    );
  }

  if (property.enum) {
    const choices = property.enum.map((val: string) => ({ id: val, name: val }));
    return <SelectField key={name} source={name} choices={choices} />;
  }

  if (property.type === 'boolean') {
    return <BooleanField key={name} source={name} />;
  }

  if (property.type === 'integer' || property.type === 'number') {
    return <NumberField key={name} source={name} />;
  }

  if (property.type === 'string') {
    if (property.format === 'date' || property.format === 'date-time') {
      return <DateField key={name} source={name} />;
    }
    return <TextField key={name} source={name} />;
  }

  if (property.type === 'array') {
    return (
      <ArrayField key={name} source={name}>
        <SingleFieldList>
          <ChipField source="id" />
        </SingleFieldList>
      </ArrayField>
    );
  }

  // Fallback
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
  const commonProps = {
    key: source,
    source,
    validate: validators,
    isRequired, // Needed for simple reference/boolean inputs to display asterisk
  };

  // 1. Check for custom vendor extensions first
  if (property['x-widget'] === 'json-editor') {
    return <JsonEditorInput {...commonProps} />;
  }

  if (property['x-widget'] === 'cdisc-terminology-lookup') {
    return <TerminologyLookupInput {...commonProps} domain={property['x-terminology-domain'] as string} />;
  }

  // Polymorphism
  if (property.oneOf || property.anyOf) {
    const schemas = (property.oneOf || property.anyOf) as OpenAPIV3.SchemaObject[];
    return <PolymorphicInput key={source} source={source} schemas={schemas} isRequired={isRequired} depth={depth + 1} />;
  }

  // Nested Objects
  if (property.type === 'object' && property.properties) {
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
  if (property.type === 'array' && property.items) {
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

  if (source.endsWith('_id') || source.endsWith('Id') || '$ref' in property) {
    const target = source.replace(/_id$/i, '').replace(/Id$/, '');
    return (
      <ReferenceInput {...commonProps} reference={target}>
        <SelectInput optionText="id" />
      </ReferenceInput>
    );
  }

  if (property.enum) {
    const choices = property.enum.map((val: string) => ({ id: val, name: val }));
    return <SelectInput {...commonProps} choices={choices} />;
  }

  if (property.type === 'boolean') {
    return <BooleanInput {...commonProps} />;
  }

  if (property.type === 'integer' || property.type === 'number') {
    return <NumberInput {...commonProps} />;
  }

  if (property.type === 'string') {
    if (property.format === 'date' || property.format === 'date-time') {
      return <DateInput {...commonProps} />;
    }
    return <TextInput {...commonProps} />;
  }

  // Fallback
  return <TextInput {...commonProps} />;
};

export const mapSchemaToInput = (
  source: string,
  property: OpenAPIV3.SchemaObject,
  isRequired: boolean,
  depth: number = 0,
): React.ReactNode => {
  const fallback = mapSchemaToInputDefault(source, property, isRequired, depth);
  const explicitOverride = typeof property['x-ui-override'] === 'string' ? property['x-ui-override'] : undefined;
  const candidates = [explicitOverride, source].filter(Boolean) as string[];

  if (candidates.length === 0) {
    return fallback;
  }

  return (
    <WidgetOverrideInput
      source={source}
      candidates={candidates}
      schemaNode={property}
      fallback={fallback}
    />
  );
};
