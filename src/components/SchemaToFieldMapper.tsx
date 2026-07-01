import {
  UrlField,
  useRecordContext,
  useCreatePath,
  useResourceContext,
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
  useDataProvider,
} from 'react-admin';
import { Link as RouterLink } from 'react-router-dom';
import MuiLink from '@mui/material/Link';
import { createElement } from 'react';
import type { OpenAPIV3 } from 'openapi-types';
import { useFormContext, useWatch } from 'react-hook-form';
import { buildValidators } from './validators';
import { UnifiedPolymorphicInput } from './UnifiedPolymorphicInput';
import { useWidgetRegistry } from '../core/WidgetRegistry';
import Typography from '@mui/material/Typography';
import type { ElementType } from 'react';
import {
  determineSchemaKind,
  getReferenceTarget,
  getWidgetId,
  getWidgetProps,
  resolveFallbackWidgetId,
  extractUiExtensions,
  type SchemaKind,
} from '../utils/heuristics';

type ValidationDescriptor = {
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
};


const AccessibleLinkField = ({ source, ...props }: { source: string, [key: string]: any }) => {
  const record = useRecordContext();
  const resource = useResourceContext();
  const createPath = useCreatePath();

  if (!record) return null;
  const value = record[source];


  if (source === 'id') {
    if (!record.id) return null;
    const path = createPath({ resource, id: record.id, type: 'edit' });
    return (
      <MuiLink component={RouterLink} to={path} variant="body2" onClick={(e: React.MouseEvent) => e.stopPropagation()} {...props}>
        {value}
      </MuiLink>
    );
  }

  return <UrlField source={source} onClick={(e: React.MouseEvent) => e.stopPropagation()} {...props} />;
};

export type PrecomputedFieldDescriptor = {
  kind: SchemaKind;
  source: string;
  description?: string;
  widgetId?: string;
  reference?: string;
  choices?: Array<{ id: string; name: string }>;
};

export type PrecomputedInputDescriptor = {
  kind: SchemaKind;
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
  options?: Array<{ label: string; discriminatorValue?: string; node: any }>;
  children?: any[];
  items?: any[];
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
  schemaNode: PrecomputedInputDescriptor;
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
  const dataProvider = useDataProvider();

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
    setValue: (nextValue: any) => {
      form.setValue(source, nextValue, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    },
    mutate: async (operation: string, payload?: any) => {
      const dp = dataProvider as any;
      if (typeof dp[operation] !== 'function') {
        throw new Error(`Data provider does not support operation: ${operation}`);
      }
      
      // Map standard RA data provider signatures (resource, params)
      if (payload && typeof payload === 'object' && 'resource' in payload) {
        const { resource, params } = payload;
        return dp[operation](resource, params || payload);
      }
      
      // Fallback for custom data provider methods
      return dp[operation](payload);
    },
  });
};

/**
 * Generated description.
 *
 */
export const renderPrecomputedField = (
  node: PrecomputedFieldDescriptor,
  keyPrefix: string = node.source,
): React.ReactNode => {
  const key = keyPrefix || node.source || 'field';

  if (node.kind === 'reference') {
    const reference = node.reference || getReferenceTarget(node.source);
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


  if (node.kind === 'link') {
    return <AccessibleLinkField key={key} source={node.source} />;
  }

  return <TextField key={key} source={node.source} />;
};


/**
 * Generated description.
 *
 */
export const mapSchemaToField = (name: string, property: any) => {
  const kind = determineSchemaKind(name, property);

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


  if (kind === 'link') {
    return <AccessibleLinkField key={name} source={name} />;
  }

  return <TextField key={name} source={name} />;
};


/**
 * Generated description.
 *
 */
export const renderInput = (
  node: PrecomputedInputDescriptor | OpenAPIV3.SchemaObject,
  sourceContext?: string,
  isRequiredContext: boolean = false,
  depth: number = 0,
  keyPrefix?: string,
): React.ReactNode => {
  if (depth > 5) return null;

  const isPrecomputed = 'kind' in node && typeof (node as any).kind === 'string' && 'source' in node;
  const source = isPrecomputed ? (node as PrecomputedInputDescriptor).source : (sourceContext as string);
  const isRequired = isPrecomputed ? (node as PrecomputedInputDescriptor).isRequired : isRequiredContext;
  const kind = isPrecomputed ? (node as PrecomputedInputDescriptor).kind : determineSchemaKind(source, node);
  const description = isPrecomputed ? (node as PrecomputedInputDescriptor).description : (node as OpenAPIV3.SchemaObject).description;
  const title = isPrecomputed ? (node as PrecomputedInputDescriptor).title : (node as OpenAPIV3.SchemaObject).title;
  const uiExtensions = isPrecomputed ? (node as PrecomputedInputDescriptor).uiExtensions : extractUiExtensions(node);
  
  const normalizedSchemaNode = isPrecomputed 
    ? (node as PrecomputedInputDescriptor) 
    : ({ ...node, uiExtensions } as unknown as PrecomputedInputDescriptor);

  const validators = isPrecomputed 
    ? buildValidatorsFromDescriptor(node as PrecomputedInputDescriptor) 
    : buildValidators(node as OpenAPIV3.SchemaObject, isRequired);

  const key = keyPrefix || source || 'input';
  const commonProps: any = {
    key,
    source,
    validate: validators,
    isRequired,
  };
  if (description) {
    commonProps['aria-description'] = description;
  }

  const renderDefault = () => {
    if (kind === 'polymorphic') {
      let options: Array<{ label: string; discriminatorValue?: string; node: any }>;
      let discriminatorProperty: string | undefined;

      if (isPrecomputed) {
        options = (node as PrecomputedInputDescriptor).options || [];
        discriminatorProperty = (node as PrecomputedInputDescriptor).discriminatorProperty;
      } else {
        const schema = node as OpenAPIV3.SchemaObject;
        const schemas = (schema.oneOf || schema.anyOf) as OpenAPIV3.SchemaObject[];
        const discriminatorMetadata = resolveDiscriminatorMetadata(schema, schemas);
        discriminatorProperty = discriminatorMetadata?.propertyName;
        options = schemas.map((s, index) => ({
          label: s.title || `Option ${index + 1} (${s.type})`,
          discriminatorValue: discriminatorMetadata?.values?.[index],
          node: s,
        }));
      }

      if (options && options.length > 0) {
        return (
          <UnifiedPolymorphicInput
            keyPrefix={key}
            source={source}
            options={options}
            discriminatorProperty={discriminatorProperty}
            isRequired={isRequired}
            depth={depth + 1}
          />
        );
      }
    }

    if (kind === 'object') {
      const childrenNodes = isPrecomputed 
        ? ((node as PrecomputedInputDescriptor).children || [])
        : Object.entries((node as OpenAPIV3.SchemaObject).properties || {}).map(([subName, subProp]) => ({
            name: subName,
            prop: subProp,
            required: ((node as OpenAPIV3.SchemaObject).required || []).includes(subName)
          }));

      const headingLevel = typeof uiExtensions?.['x-ui-headingLevel'] === 'string' && /^h[1-6]$/.test(uiExtensions['x-ui-headingLevel']) 
        ? uiExtensions['x-ui-headingLevel'] 
        : 'h4';
      const headingVariant = typeof uiExtensions?.['x-ui-headingVariant'] === 'string' && /^h[1-6]$/.test(uiExtensions['x-ui-headingVariant']) 
        ? uiExtensions['x-ui-headingVariant'] 
        : 'h4';

      return (
        <div key={key} style={{ marginLeft: '1rem', borderLeft: '2px solid #eee', paddingLeft: '1rem' }}>
          <Typography variant={headingVariant as any} component={headingLevel as ElementType}>
            {title || source.split('.').pop() || source}
          </Typography>
          {isPrecomputed 
            ? (childrenNodes as PrecomputedInputDescriptor[]).map((child, index) => 
                renderInput(child, `${key}.${child.source || index}`, child.isRequired, depth + 1, `${key}.${child.source || index}`))
            : (childrenNodes as any[]).map((child) => {
                const nestedSource = source ? `${source}.${child.name}` : child.name;
                return renderInput(child.prop, nestedSource, child.required, depth + 1, `${key}.${child.name}`);
              })
          }
        </div>
      );
    }

    if (kind === 'array') {
      let itemNodes: React.ReactNode[] = [];
      if (isPrecomputed) {
        const items = (node as PrecomputedInputDescriptor).items || [];
        itemNodes = items.map((item, index) => renderInput(item, `${key}.item.${index}`, item.isRequired, depth + 1, `${key}.item.${index}`));
      } else {
        const itemSchema = (node as OpenAPIV3.SchemaObject).items as OpenAPIV3.SchemaObject;
        if (itemSchema && itemSchema.type === 'object' && itemSchema.properties) {
          itemNodes = Object.entries(itemSchema.properties).map(([subName, subProp]) => 
            renderInput(subProp as OpenAPIV3.SchemaObject, subName, (itemSchema.required || []).includes(subName), depth + 1, `${key}.item.${subName}`)
          );
        } else if (itemSchema) {
          itemNodes = [renderInput(itemSchema, '', false, depth + 1, `${key}.item`)];
        }
      }

      return (
        <ArrayInput {...commonProps}>
          <SimpleFormIterator inline>
            {itemNodes}
          </SimpleFormIterator>
        </ArrayInput>
      );
    }

    if (kind === 'reference') {
      const referenceTarget = isPrecomputed 
        ? ((node as PrecomputedInputDescriptor).reference || getReferenceTarget(source))
        : getReferenceTarget(source);
      return (
        <ReferenceInput {...commonProps} reference={referenceTarget}>
          <SelectInput optionText="id" />
        </ReferenceInput>
      );
    }

    if (kind === 'enum') {
      const choices = isPrecomputed 
        ? ((node as PrecomputedInputDescriptor).choices || [])
        : ((node as OpenAPIV3.SchemaObject).enum || []).map((val: string) => ({ id: val, name: val }));
      return <SelectInput {...commonProps} choices={choices} />;
    }

    if (kind === 'boolean') return <BooleanInput {...commonProps} />;
    if (kind === 'number') return <NumberInput {...commonProps} />;
    if (kind === 'date') return <DateInput {...commonProps} />;
    return <TextInput {...commonProps} />;
  };

  const fallback = renderDefault();

  const candidateWidgetId = isPrecomputed 
    ? (node as PrecomputedInputDescriptor).widgetId 
    : getWidgetId(node);
  const widgetProps = isPrecomputed 
    ? (node as PrecomputedInputDescriptor).widgetProps 
    : (getWidgetProps(node) || {});

  return (
    <WidgetOverrideInput
      source={source}
      candidateWidgetId={candidateWidgetId}
      fallbackWidgetId={source}
      widgetProps={widgetProps}
      schemaNode={normalizedSchemaNode}
      fallback={fallback}
    />
  );
};

// Also export deprecated aliases if needed, but since we are refactoring, we might just update the imports
export const renderPrecomputedInput = renderInput;
export const mapSchemaToInput = renderInput;

