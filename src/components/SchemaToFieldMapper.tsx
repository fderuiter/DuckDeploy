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
import {
  WidgetValueContext,
  WidgetMetaContext,
  WidgetRecordContext,
  WidgetMutationContext,
  useWidgetRegistry,
} from '../core/WidgetRegistry';
import Typography from '@mui/material/Typography';
import type { ElementType } from 'react';
import {
  determineSchemaKind,
  getReferenceTarget,
  getWidgetId,
  getWidgetProps,
  resolveFallbackWidgetId,
  extractUiExtensions,
  extractMetadata,
  type SchemaKind,
} from '../utils/heuristics';
import { useAccessibility } from '../core/AccessibilityContext';
import { useSharedMutationService, buildCommonProps, buildTrackerNodes, useComponentResolver } from '../core/Engine';

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
  widgetProps?: Record<string, unknown>;
  uiExtensions?: Record<string, unknown>;
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
  fallbackProps?: any;
  fallback?: React.ReactNode;
};

const WidgetOverrideInput = ({
  source,
  candidateWidgetId,
  fallbackWidgetId,
  widgetProps,
  schemaNode,
  fallbackProps,
  fallback,
}: WidgetOverrideInputProps) => {
  const form = useFormContext();
  const handleMutate = useSharedMutationService();
  const { resolveInput } = useComponentResolver(ComponentMappingFactory);

  const Widget = resolveInput(schemaNode.kind, candidateWidgetId, fallbackWidgetId);

  const value = useWatch({ control: form.control, name: source });

  if (!Widget) {
    return <>{fallback}</>;
  }
  if (!source) return null;

  const handleSetValue = (nextValue: any) => {
    form.setValue(source, nextValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };
  const valueProps = { source, value, setValue: handleSetValue };
  const metaProps = { schemaNode, widgetProps: widgetProps || {} };
  const recordProps = { record: (form.getValues() as Record<string, unknown>) ?? {} };
  const mutationProps = { mutate: handleMutate };

  return (
    <WidgetMutationContext.Provider value={mutationProps}>
      <WidgetRecordContext.Provider value={recordProps}>
        <WidgetMetaContext.Provider value={metaProps}>
          <WidgetValueContext.Provider value={valueProps}>
            {createElement(Widget as any, { ...valueProps, ...metaProps, ...fallbackProps })}
          </WidgetValueContext.Provider>
        </WidgetMetaContext.Provider>
      </WidgetRecordContext.Provider>
    </WidgetMutationContext.Provider>
  );
};

type WidgetOverrideFieldProps = {
  source: string;
  candidateWidgetId?: string;
  fallbackWidgetId?: string;
  widgetProps?: Record<string, unknown>;
  schemaNode: PrecomputedFieldDescriptor;
  fallbackProps?: any;
  fallback?: React.ReactNode;
};

const WidgetOverrideField = ({
  source,
  candidateWidgetId,
  fallbackWidgetId,
  widgetProps,
  schemaNode,
  fallbackProps,
  fallback,
}: WidgetOverrideFieldProps) => {
  const record = useRecordContext();
  const handleMutate = useSharedMutationService();
  const { resolveField } = useComponentResolver(ComponentMappingFactory);

  const Widget = resolveField(schemaNode.kind, candidateWidgetId, fallbackWidgetId);

  const value = record ? record[source] : undefined;

  if (!Widget) {
    return <>{fallback}</>;
  }
  if (!source) return null;

  return createElement(Widget as any, {
    record: record || {},
    schemaNode,
    source,
    value,
    widgetProps: widgetProps || {},
    mutate: handleMutate,
    ...fallbackProps,
  });
};

/**
 * Generated description.
 *
 */

export const ComponentMappingFactory: Record<string, {
  Field: React.FC<any>;
  Input: React.FC<any>;
}> = {
  reference: {
    Field: ({ commonProps, reference, trackerNodes }) => (
      <ReferenceField {...commonProps} reference={reference}>
        <TextField source="id" />
        {trackerNodes}
      </ReferenceField>
    ),
    Input: ({ commonProps, reference, trackerNodes }) => (
      <>
        <ReferenceInput {...commonProps} reference={reference}>
          <SelectInput optionText={(choice) => choice?.name || choice?.title || choice?.id} />
        </ReferenceInput>
        {trackerNodes}
      </>
    )
  },
  enum: {
    Field: ({ commonProps, choices, trackerNodes }) => <><SelectField {...commonProps} choices={choices} />{trackerNodes}</>,
    Input: ({ commonProps, choices, trackerNodes }) => <><SelectInput {...commonProps} choices={choices} />{trackerNodes}</>
  },
  boolean: {
    Field: ({ commonProps, trackerNodes }) => <><BooleanField {...commonProps} />{trackerNodes}</>,
    Input: ({ commonProps, trackerNodes }) => <><BooleanInput {...commonProps} />{trackerNodes}</>
  },
  number: {
    Field: ({ commonProps, trackerNodes }) => <><NumberField {...commonProps} />{trackerNodes}</>,
    Input: ({ commonProps, trackerNodes }) => <><NumberInput {...commonProps} />{trackerNodes}</>
  },
  date: {
    Field: ({ commonProps, trackerNodes }) => <><DateField {...commonProps} />{trackerNodes}</>,
    Input: ({ commonProps, trackerNodes }) => <><DateInput {...commonProps} />{trackerNodes}</>
  },
  array: {
    Field: ({ commonProps, trackerNodes }) => (
      <ArrayField {...commonProps}>
        <SingleFieldList>
          <ChipField source="id" />
        </SingleFieldList>
        {trackerNodes}
      </ArrayField>
    ),
    Input: ({ commonProps, itemNodes, trackerNodes }) => (
      <ArrayInput {...commonProps}>
        <SimpleFormIterator inline>
          {itemNodes}
        </SimpleFormIterator>
        {trackerNodes}
      </ArrayInput>
    )
  },
  link: {
    Field: ({ commonProps, trackerNodes }) => <><AccessibleLinkField {...commonProps} />{trackerNodes}</>,
    Input: ({ commonProps, trackerNodes }) => <><TextInput {...commonProps} />{trackerNodes}</>
  },
  default: {
    Field: ({ commonProps, trackerNodes }) => <><TextField {...commonProps} />{trackerNodes}</>,
    Input: ({ commonProps, trackerNodes }) => <><TextInput {...commonProps} />{trackerNodes}</>
  }
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
  const { title, description, isHeuristicTitle } = extractMetadata(node, node.source);
  
  const commonProps = buildCommonProps({ source: node.source, title, description, key });
  const trackerNodes = buildTrackerNodes(node.source, isHeuristicTitle, description);

  const reference = node.kind === 'reference' ? (node.reference || getReferenceTarget(node.source)) : undefined;

  return (
    <WidgetOverrideField
      key={key}
      source={node.source}
      candidateWidgetId={node.widgetId}
      fallbackWidgetId={node.source}
      widgetProps={node.widgetProps}
      schemaNode={node}
      fallbackProps={{ commonProps, reference, choices: node.choices || [], trackerNodes }}
      fallback={<ComponentMappingFactory.default.Field commonProps={commonProps} reference={reference} choices={node.choices || []} trackerNodes={trackerNodes} />}
    />
  );
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
  const { title, description, isHeuristicTitle } = extractMetadata(node, source);
  const uiExtensions = isPrecomputed ? (node as PrecomputedInputDescriptor).uiExtensions : extractUiExtensions(node);
  
  const normalizedSchemaNode = isPrecomputed 
    ? (node as PrecomputedInputDescriptor) 
    : ({ ...node, uiExtensions } as unknown as PrecomputedInputDescriptor);

  const validators = isPrecomputed 
    ? buildValidatorsFromDescriptor(node as PrecomputedInputDescriptor) 
    : buildValidators(node as OpenAPIV3.SchemaObject, isRequired);

  const key = keyPrefix || source || 'input';
  const commonProps = buildCommonProps({
    source,
    title,
    description,
    isRequired,
    key,
    validators,
  });

  const trackerNodes = buildTrackerNodes(source, isHeuristicTitle, description);

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
        options = schemas.map((s, index) => {
          const optMeta = extractMetadata(s, `Option ${index + 1}`);
          return {
            label: optMeta.title || `Option ${index + 1} (${s.type})`,
            discriminatorValue: discriminatorMetadata?.values?.[index],
            node: s,
          };
        });
      }

      if (options && options.length > 0) {
        return (
          <>
            <UnifiedPolymorphicInput
              keyPrefix={key}
              source={source}
              options={options}
              discriminatorProperty={discriminatorProperty}
              isRequired={isRequired}
              depth={depth + 1}
            />
            {trackerNodes}
          </>
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
        <div 
          key={key} 
          role="group" 
          aria-label={title || source.split('.').pop() || source}
          style={{ marginLeft: '1rem', borderLeft: '2px solid #eee', paddingLeft: '1rem' }}
        >
          <Typography variant={headingVariant as any} component={headingLevel as ElementType}>
            {title || source.split('.').pop() || source}
          </Typography>
          {trackerNodes}
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
          {trackerNodes}
        </ArrayInput>
      );
    }

    if (kind === 'reference') {
      const referenceTarget = isPrecomputed 
        ? ((node as PrecomputedInputDescriptor).reference || getReferenceTarget(source))
        : getReferenceTarget(source);
      return <ComponentMappingFactory.reference.Input commonProps={commonProps} reference={referenceTarget} trackerNodes={trackerNodes} />;
    }

    if (kind === 'enum') {
      const choices = isPrecomputed 
        ? ((node as PrecomputedInputDescriptor).choices || [])
        : ((node as OpenAPIV3.SchemaObject).enum || []).map((val: string) => ({ id: val, name: val }));
      return <ComponentMappingFactory.enum.Input commonProps={commonProps} choices={choices} trackerNodes={trackerNodes} />;
    }

    const ComponentDef = ComponentMappingFactory[kind] || ComponentMappingFactory.default;
    return <ComponentDef.Input commonProps={commonProps} trackerNodes={trackerNodes} itemNodes={itemNodes} />;
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
      fallbackProps={{ commonProps, trackerNodes }}
      fallback={fallback}
    />
  );
};

// Also export deprecated aliases if needed, but since we are refactoring, we might just update the imports


