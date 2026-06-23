export const isReferenceField = (name: string): boolean => {
  return name.endsWith('_id') || name.endsWith('Id');
};

export const getReferenceTarget = (name: string): string => {
  return name.replace(/_id$/i, '').replace(/Id$/, '');
};

export const extractUiExtensions = (node: any): Record<string, unknown> => {
  if (!node || typeof node !== 'object') return {};

  return Object.keys(node)
    .filter((key) => key.startsWith('x-ui-'))
    .reduce((acc, key) => {
      acc[key] = node[key];
      return acc;
    }, {} as Record<string, unknown>);
};

export const getWidgetId = (node: any): string | undefined => {
  const ext = extractUiExtensions(node);
  return typeof ext['x-ui-widget'] === 'string' ? ext['x-ui-widget'] : undefined;
};

export const getWidgetProps = (node: any): Record<string, unknown> | undefined => {
  const ext = extractUiExtensions(node);
  return ext['x-ui-props'] && typeof ext['x-ui-props'] === 'object'
    ? (ext['x-ui-props'] as Record<string, unknown>)
    : undefined;
};

export const resolveFallbackWidgetId = (
  candidateWidgetId?: string,
  fallbackWidgetId?: string,
): string | undefined => {
  return candidateWidgetId || fallbackWidgetId;
};

export type SchemaKind =
  | 'reference'
  | 'enum'
  | 'boolean'
  | 'number'
  | 'date'
  | 'array'
  | 'text'
  | 'object'
  | 'polymorphic'
  | 'unknown';

export const determineSchemaKindForField = (name: string, node: any): SchemaKind => {
  if (!node || typeof node !== 'object') return 'unknown';

  if (isReferenceField(name) || node.$ref) {
    return 'reference';
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return 'enum';
  }

  if (node.type === 'boolean') {
    return 'boolean';
  }

  if (node.type === 'integer' || node.type === 'number') {
    return 'number';
  }

  if (node.type === 'string' && (node.format === 'date' || node.format === 'date-time')) {
    return 'date';
  }

  if (node.type === 'array') {
    return 'array';
  }

  return 'text';
};

export const determineSchemaKindForInput = (name: string, node: any): SchemaKind => {
  if (!node || typeof node !== 'object') return 'unknown';

  if ((Array.isArray(node.oneOf) && node.oneOf.length > 0) || (Array.isArray(node.anyOf) && node.anyOf.length > 0)) {
    return 'polymorphic';
  }

  if (node.type === 'object' && node.properties) {
    return 'object';
  }

  if (node.type === 'array' && node.items) {
    return 'array';
  }

  if (isReferenceField(name) || node.$ref) {
    return 'reference';
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return 'enum';
  }

  if (node.type === 'boolean') {
    return 'boolean';
  }

  if (node.type === 'integer' || node.type === 'number') {
    return 'number';
  }

  if (node.type === 'string' && (node.format === 'date' || node.format === 'date-time')) {
    return 'date';
  }

  return 'text';
};

export const resolveRefPath = (spec: any, ref: string): any => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;

  const parts = ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = spec;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return null;
    }
    current = current[part];
  }

  return current;
};

export const escapeJsonPointer = (segment: string | number): string =>
  String(segment)
    .replace(/~/g, '~0')
    .replace(/\//g, '~1');

export const isObject = (value: any): boolean => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const mergeUnique = (base: any[] = [], override: any[] = []): any[] => Array.from(new Set([...(base || []), ...(override || [])]));
export const toDiscriminatorValue = (value: any): string | undefined =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;

export const resolveStrictDiscriminator = (schema: any, variants: any[]): { propertyName: string; values: string[] } | null => {
  const discriminator = isObject(schema?.discriminator) ? schema.discriminator : null;
  const propertyName =
    typeof discriminator?.propertyName === 'string' && discriminator.propertyName.trim().length > 0
      ? discriminator.propertyName
      : null;

  if (!propertyName || !Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  const mappingByRef = new Map<string, string>();
  if (isObject(discriminator.mapping)) {
    for (const [value, ref] of Object.entries(discriminator.mapping)) {
      if (typeof ref === 'string' && ref.trim().length > 0) {
        mappingByRef.set(ref, value);
      }
    }
  }

  const values = variants.map((variant) => {
    const variantRef = typeof variant?.['x-origin-ref'] === 'string' ? variant['x-origin-ref'] : null;
    if (variantRef && mappingByRef.has(variantRef)) {
      return mappingByRef.get(variantRef);
    }

    const discriminatorProperty = isObject(variant?.properties?.[propertyName]) ? variant.properties[propertyName] : null;
    const constValue = toDiscriminatorValue(discriminatorProperty?.const);
    if (constValue !== undefined) {
      return constValue;
    }

    if (Array.isArray(discriminatorProperty?.enum) && discriminatorProperty.enum.length === 1) {
      const enumValue = toDiscriminatorValue(discriminatorProperty.enum[0]);
      if (enumValue !== undefined) {
        return enumValue;
      }
    }

    return undefined;
  });

  if (values.some((value) => value === undefined || value === '')) {
    return null;
  }

  return { propertyName, values: values as string[] };
};

export const mergeSchema = (baseSchema: any, overrideSchema: any): any => {
  if (!isObject(baseSchema) || !isObject(overrideSchema)) {
    if (overrideSchema !== undefined) return overrideSchema;
    if (baseSchema !== undefined) return baseSchema;
    return {};
  }

  const merged = { ...(baseSchema || {}), ...(overrideSchema || {}) };

  if (baseSchema?.properties || overrideSchema?.properties) {
    const baseProperties = baseSchema?.properties || {};
    const overrideProperties = overrideSchema?.properties || {};
    const propertyNames = new Set([...Object.keys(baseProperties), ...Object.keys(overrideProperties)]);
    merged.properties = {};
    for (const propertyName of propertyNames) {
      const baseProperty = baseProperties[propertyName];
      const overrideProperty = overrideProperties[propertyName];
      merged.properties[propertyName] =
        baseProperty !== undefined && overrideProperty !== undefined
          ? mergeSchema(baseProperty, overrideProperty)
          : (baseProperty ?? overrideProperty);
    }
  }

  if (baseSchema?.required || overrideSchema?.required) {
    merged.required = mergeUnique(baseSchema?.required || [], overrideSchema?.required || []);
  }

  if (baseSchema?.allOf || overrideSchema?.allOf) {
    merged.allOf = [...(baseSchema?.allOf || []), ...(overrideSchema?.allOf || [])];
  }

  if (baseSchema?.anyOf || overrideSchema?.anyOf) {
    merged.anyOf = [...(baseSchema?.anyOf || []), ...(overrideSchema?.anyOf || [])];
  }

  if (baseSchema?.oneOf || overrideSchema?.oneOf) {
    merged.oneOf = [...(baseSchema?.oneOf || []), ...(overrideSchema?.oneOf || [])];
  }

  if (isObject(baseSchema?.dependentSchemas) || isObject(overrideSchema?.dependentSchemas)) {
    const mergedDependentSchemas: any = {
      ...(baseSchema?.dependentSchemas || {}),
      ...(overrideSchema?.dependentSchemas || {}),
    };

    for (const key of Object.keys(baseSchema?.dependentSchemas || {})) {
      if (isObject(baseSchema.dependentSchemas[key]) && isObject(overrideSchema?.dependentSchemas?.[key])) {
        mergedDependentSchemas[key] = mergeSchema(baseSchema.dependentSchemas[key], overrideSchema.dependentSchemas[key]);
      }
    }

    merged.dependentSchemas = mergedDependentSchemas;
  }

  if (isObject(baseSchema?.dependentRequired) || isObject(overrideSchema?.dependentRequired)) {
    const keys = new Set([
      ...Object.keys(baseSchema?.dependentRequired || {}),
      ...Object.keys(overrideSchema?.dependentRequired || {}),
    ]);
    merged.dependentRequired = {};
    for (const key of keys) {
      merged.dependentRequired[key] = mergeUnique(
        baseSchema?.dependentRequired?.[key] || [],
        overrideSchema?.dependentRequired?.[key] || [],
      );
    }
  }

  if (isObject(baseSchema?.items) && isObject(overrideSchema?.items)) {
    merged.items = mergeSchema(baseSchema.items, overrideSchema.items);
  }

  if (isObject(baseSchema?.additionalProperties) && isObject(overrideSchema?.additionalProperties)) {
    merged.additionalProperties = mergeSchema(baseSchema.additionalProperties, overrideSchema.additionalProperties);
  }

  if (isObject(baseSchema?.not) && isObject(overrideSchema?.not)) {
    merged.not = mergeSchema(baseSchema.not, overrideSchema.not);
  }

  for (const keyword of ['if', 'then', 'else', 'contains', 'propertyNames', 'unevaluatedProperties']) {
    if (isObject(baseSchema?.[keyword]) && isObject(overrideSchema?.[keyword])) {
      merged[keyword] = mergeSchema(baseSchema[keyword], overrideSchema[keyword]);
    }
  }

  return merged;
};

export class BaseSchemaVisitor {
  spec: any;
  maxDepth: number;

  constructor(spec: any, maxDepth: number) {
    this.spec = spec;
    this.maxDepth = maxDepth;
  }

  withRefPath(context: any, ref: string) {
    const refPath = context.refPath || [];
    if (refPath.includes(ref)) {
      return {
        context,
        stop: true,
        marker: {
          'x-lazy-ref': ref,
          'x-circular-ref': true,
        },
      };
    }

    return {
      context: { ...context, refPath: [...refPath, ref] },
      stop: false,
      marker: null,
    };
  }

  normalizeSchema(schema: any, context: any = { refPath: [] }): { schema: any; context: any } {
    if (!schema || typeof schema !== 'object') {
      return { schema: null, context };
    }

    if (schema.$ref) {
      const pathState = this.withRefPath(context, schema.$ref);
      if (pathState.stop) {
        const { $ref, ...overrides } = schema;
        return { schema: mergeSchema(pathState.marker, overrides), context };
      }

      const resolved = resolveRefPath(this.spec, schema.$ref);
      if (!resolved || typeof resolved !== 'object') {
        return { schema: null, context };
      }

      const { $ref, ...overrides } = schema;
      const merged = mergeSchema(resolved, overrides);
      if (typeof schema.$ref === 'string' && !merged['x-origin-ref']) {
        merged['x-origin-ref'] = schema.$ref;
      }
      return { schema: this.normalizeSchema(merged, pathState.context).schema, context };
    }

    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      let accumulator = {};

      for (const partial of schema.allOf) {
        const normalized = this.normalizeSchema(partial, context);
        if (normalized.schema) {
          accumulator = mergeSchema(accumulator, normalized.schema);
        }
      }

      const { allOf, ...rest } = schema;
      return this.normalizeSchema(mergeSchema(accumulator, rest), context);
    }

    const normalizedSchema = { ...schema };

    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
      normalizedSchema.oneOf = schema.oneOf
        .map((variant: any) => this.normalizeSchema(variant, context).schema)
        .filter((variant: any) => Boolean(variant));
    }

    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
      normalizedSchema.anyOf = schema.anyOf
        .map((variant: any) => this.normalizeSchema(variant, context).schema)
        .filter((variant: any) => Boolean(variant));
    }

    if (isObject(schema.not)) {
      normalizedSchema.not = this.normalizeSchema(schema.not, context).schema || schema.not;
    }

    if (isObject(schema.dependentSchemas)) {
      normalizedSchema.dependentSchemas = Object.entries(schema.dependentSchemas).reduce((acc: any, [key, dependentSchema]) => {
        const normalized = this.normalizeSchema(dependentSchema, context).schema;
        if (normalized) acc[key] = normalized;
        return acc;
      }, {});
    }

    if (isObject(schema.properties)) {
      normalizedSchema.properties = Object.entries(schema.properties).reduce((acc: any, [key, value]) => {
        const normalized = this.normalizeSchema(value, context).schema;
        acc[key] = normalized || value;
        return acc;
      }, {});
    }

    if (isObject(schema.patternProperties)) {
      normalizedSchema.patternProperties = Object.entries(schema.patternProperties).reduce((acc: any, [key, value]) => {
        const normalized = this.normalizeSchema(value, context).schema;
        acc[key] = normalized || value;
        return acc;
      }, {});
    }

    if (isObject(schema.items)) {
      normalizedSchema.items = this.normalizeSchema(schema.items, context).schema || schema.items;
    } else if (Array.isArray(schema.items)) {
      normalizedSchema.items = schema.items.map((item: any) => this.normalizeSchema(item, context).schema || item);
    }

    for (const keyword of ['if', 'then', 'else', 'contains', 'propertyNames', 'additionalProperties', 'unevaluatedProperties']) {
      if (isObject(schema[keyword])) {
        normalizedSchema[keyword] = this.normalizeSchema(schema[keyword], context).schema || schema[keyword];
      }
    }

    return { schema: normalizedSchema, context };
  }
}

export const extractListProperties = (schema: any, visitor: BaseSchemaVisitor): any => {
  if (!schema || typeof schema !== 'object') return {};

  const normalizedRoot = visitor.normalizeSchema(schema, { refPath: [] }).schema || schema;

  if (normalizedRoot.type === 'array' && normalizedRoot.items) {
    const normalizedItems = visitor.normalizeSchema(normalizedRoot.items, { refPath: [] }).schema;
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties?.items?.items) {
    const normalizedItems = visitor.normalizeSchema(normalizedRoot.properties.items.items, { refPath: [] }).schema;
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties?.data?.items) {
    const normalizedItems = visitor.normalizeSchema(normalizedRoot.properties.data.items, { refPath: [] }).schema;
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties) return normalizedRoot.properties;

  return {};
};
