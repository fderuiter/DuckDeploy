import { sortKeysDeep } from './schema.ts';

const isObject = (item: any): boolean => item && typeof item === 'object' && !Array.isArray(item);

const mergeUnique = (arr1: any[], arr2: any[]): any[] => Array.from(new Set([...arr1, ...arr2]));

/**
 * Generated description.
 *
 */
export const mergeSchemas = (baseSchema: any, overrideSchema: any): any => {
  if (!isObject(baseSchema) || !isObject(overrideSchema)) {
    if (overrideSchema !== undefined) return overrideSchema;
    if (baseSchema !== undefined) return baseSchema;
    return {};
  }

  const merged: any = { ...(baseSchema || {}), ...(overrideSchema || {}) };

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
          ? mergeSchemas(baseProperty, overrideProperty)
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
        mergedDependentSchemas[key] = mergeSchemas(baseSchema.dependentSchemas[key], overrideSchema.dependentSchemas[key]);
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
    merged.items = mergeSchemas(baseSchema.items, overrideSchema.items);
  }

  if (isObject(baseSchema?.additionalProperties) && isObject(overrideSchema?.additionalProperties)) {
    merged.additionalProperties = mergeSchemas(baseSchema.additionalProperties, overrideSchema.additionalProperties);
  }

  if (isObject(baseSchema?.not) && isObject(overrideSchema?.not)) {
    merged.not = mergeSchemas(baseSchema.not, overrideSchema.not);
  }

  for (const keyword of ['if', 'then', 'else', 'contains', 'propertyNames', 'unevaluatedProperties']) {
    if (isObject(baseSchema?.[keyword]) && isObject(overrideSchema?.[keyword])) {
      merged[keyword] = mergeSchemas(baseSchema[keyword], overrideSchema[keyword]);
    }
  }

  return merged;
};

/**
 * Generated description.
 *
 */
export const normalizeSchema = (schema: any): any => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    let accumulator = {};
    for (const partial of schema.allOf) {
      const normalized = normalizeSchema(partial);
      if (normalized) {
        accumulator = mergeSchemas(accumulator, normalized);
      }
    }
    const rest = { ...schema };
    delete rest.allOf;
    return normalizeSchema(mergeSchemas(accumulator, rest));
  }

  const normalizedSchema = { ...schema };

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    normalizedSchema.oneOf = schema.oneOf
      .map((variant: any) => normalizeSchema(variant))
      .filter(Boolean);
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    normalizedSchema.anyOf = schema.anyOf
      .map((variant: any) => normalizeSchema(variant))
      .filter(Boolean);
  }

  if (isObject(schema.not)) {
    normalizedSchema.not = normalizeSchema(schema.not) || schema.not;
  }

  if (isObject(schema.dependentSchemas)) {
    normalizedSchema.dependentSchemas = Object.entries(schema.dependentSchemas).reduce((acc: any, [key, dependentSchema]) => {
      const normalized = normalizeSchema(dependentSchema);
      if (normalized) acc[key] = normalized;
      return acc;
    }, {});
  }

  if (isObject(schema.properties)) {
    normalizedSchema.properties = Object.entries(schema.properties).reduce((acc: any, [key, value]) => {
      const normalized = normalizeSchema(value);
      acc[key] = normalized || value;
      return acc;
    }, {});
  }

  if (isObject(schema.patternProperties)) {
    normalizedSchema.patternProperties = Object.entries(schema.patternProperties).reduce((acc: any, [key, value]) => {
      const normalized = normalizeSchema(value);
      acc[key] = normalized || value;
      return acc;
    }, {});
  }

  if (isObject(schema.items)) {
    normalizedSchema.items = normalizeSchema(schema.items) || schema.items;
  } else if (Array.isArray(schema.items)) {
    normalizedSchema.items = schema.items.map((item: any) => normalizeSchema(item) || item);
  }

  for (const keyword of ['if', 'then', 'else', 'contains', 'propertyNames', 'additionalProperties', 'unevaluatedProperties']) {
    if (isObject(schema[keyword])) {
      normalizedSchema[keyword] = normalizeSchema(schema[keyword]) || schema[keyword];
    }
  }

  return sortKeysDeep(normalizedSchema);
};

/**
 * Generated description.
 *
 */
export const resolveDiscriminator = (schema: any, originRef?: string): { propertyName?: string; values: string[] } | null => {
  if (!schema?.discriminator?.propertyName) return null;

  const propertyName = schema.discriminator.propertyName;
  const values: string[] = [];

  if (schema.discriminator.mapping && originRef) {
    // If explicit mappings exist, try to match originRef
    const mappingEntries = Object.entries(schema.discriminator.mapping);
    for (const [val, ref] of mappingEntries) {
      if (ref === originRef) {
        values.push(val);
      }
    }
  }

  if (values.length === 0) {
    // Implicit value checks (the schema might enforce a const value for the discriminator)
    if (schema.properties?.[propertyName]?.const) {
      values.push(schema.properties[propertyName].const);
    } else if (schema.properties?.[propertyName]?.enum?.length === 1) {
      values.push(schema.properties[propertyName].enum[0]);
    }
  }

  return { propertyName, values: values.length > 0 ? values : [] };
};

/**
 * Generated description.
 *
 */
export const injectOriginRefs = (node: any): void => {
  if (Array.isArray(node)) {
    for (const item of node) {
      injectOriginRefs(item);
    }
    return;
  }

  if (!node || typeof node !== 'object') {
    return;
  }

  if (typeof node.$ref === 'string') {
    node['x-origin-ref'] = node.$ref;
  }

  for (const value of Object.values(node)) {
    injectOriginRefs(value);
  }
};
