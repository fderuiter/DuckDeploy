import type { OpenAPIV3 } from 'openapi-types';

export const isSchemaObject = (
  obj: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
): obj is OpenAPIV3.SchemaObject =>
  typeof obj === 'object' && obj !== null && !('$ref' in obj);

export const flattenAllOf = (schema: OpenAPIV3.SchemaObject | undefined): OpenAPIV3.SchemaObject | undefined => {
  if (!schema) return schema;
  if (!schema.allOf || schema.allOf.length === 0) return schema;

  const merged: OpenAPIV3.SchemaObject = { ...schema };
  delete merged.allOf;
  
  merged.properties = { ...(merged.properties || {}) };

  for (const part of schema.allOf) {
    if (isSchemaObject(part)) {
      const flattenedPart = flattenAllOf(part);
      if (flattenedPart?.properties) {
        Object.assign(merged.properties, flattenedPart.properties);
      }
    }
  }

  return merged;
};

export const resolvePolymorphicSchema = (
  schema: OpenAPIV3.SchemaObject | undefined,
  activeIndex?: number | null,
): OpenAPIV3.SchemaObject | undefined => {
  if (!schema) return schema;
  const branches = (schema.oneOf || schema.anyOf) as OpenAPIV3.SchemaObject[] | undefined;
  if (branches && activeIndex !== undefined && activeIndex !== null && !Number.isNaN(activeIndex)) {
    const branch = branches[activeIndex];
    if (isSchemaObject(branch)) {
      return flattenAllOf(branch);
    }
  }
  return flattenAllOf(schema);
};

export const extractConstraints = (property: OpenAPIV3.SchemaObject | undefined) => {
  if (!property) return {};
  return {
    minLength: property.minLength,
    maxLength: property.maxLength,
    minimum: property.minimum,
    maximum: property.maximum,
    pattern: property.pattern,
  };
};

export const applyConstraintLogic = (value: unknown, constraints: ReturnType<typeof extractConstraints>): boolean => {
  if (value === null || value === undefined || value === '') return true; // Let required validator handle this
  
  if (typeof value === 'string') {
    if (constraints.minLength !== undefined && value.length < constraints.minLength) return false;
    if (constraints.maxLength !== undefined && value.length > constraints.maxLength) return false;
    if (constraints.pattern) {
      const regex = new RegExp(constraints.pattern);
      if (!regex.test(value)) return false;
    }
  } else if (typeof value === 'number') {
    if (constraints.minimum !== undefined && value < constraints.minimum) return false;
    if (constraints.maximum !== undefined && value > constraints.maximum) return false;
  }
  
  return true;
};
