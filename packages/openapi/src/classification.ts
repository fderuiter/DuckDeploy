import { normalizeSchema } from './normalization.ts';

/**
 * Checks if a field is a reference field.
 */
export const isReferenceField = (name: string): boolean => {
  return name.endsWith('_id') || name.endsWith('Id');
};

/**
 * Extracts the target of a reference field.
 */
export const getReferenceTarget = (name: string): string => {
  return name.replace(/_id$/i, '').replace(/Id$/, '');
};

/**
 * Regular expression to validate heading levels h1 through h6.
 */
export const HEADING_REGEX = /^h[1-6]$/;

/**
 * Validates a heading level string, falling back to a default if invalid.
 */
export const validateHeading = (value: unknown, fallback: string = 'h4'): string => {
  return typeof value === 'string' && HEADING_REGEX.test(value) ? value : fallback;
};

/**
 * Generates a human-readable label from a property key.
 */
export const generateHeuristicLabel = (key: string): string => {
  if (!key) return '';
  const leaf = key.split('.').pop() || key;
  const words = leaf
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .trim()
    .split(/\s+/);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Standardizes metadata extraction to ensure both title and description are preserved.
 */
export const extractMetadata = (node: any, sourceName: string) => {
  const isHeuristicTitle = !node?.title;
  const title = isHeuristicTitle ? generateHeuristicLabel(sourceName) : node.title;
  const description = node?.description;
  return { title, description, isHeuristicTitle };
};

/**
 * Extracts all UI extension metadata from a schema node.
 */
export const extractUiExtensions = (node: any): Record<string, unknown> => {
  if (!node || typeof node !== 'object') return {};

  return Object.keys(node)
    .filter((key) => key.startsWith('x-ui-'))
    .reduce((acc, key) => {
      acc[key] = node[key];
      return acc;
    }, {} as Record<string, unknown>);
};

/**
 * Determines the primary field for a given schema node.
 */
export const getPrimaryField = (node: any): string | undefined => {
  if (!node || typeof node !== 'object') return undefined;

  const ext = extractUiExtensions(node);
  if (typeof ext['x-ui-primary-field'] === 'string') {
    return ext['x-ui-primary-field'];
  }

  if (node.properties && typeof node.properties === 'object') {
    for (const key of Object.keys(node.properties)) {
      const propExt = extractUiExtensions(node.properties[key]);
      if (propExt['x-ui-primary-field'] === true) {
        return key;
      }
    }
  }

  if (node.properties && typeof node.properties === 'object') {
    const keys = Object.keys(node.properties);
    const fallbacks = ['name', 'title', 'label', 'description', 'summary'];
    for (const fb of fallbacks) {
      if (keys.includes(fb)) return fb;
    }
  }

  return 'id';
};

/**
 * Retrieves the widget ID from the UI extensions of a schema node.
 */
export const getWidgetId = (node: any): string | undefined => {
  const ext = extractUiExtensions(node);
  return typeof ext['x-ui-widget'] === 'string' ? ext['x-ui-widget'] : undefined;
};

/**
 * Retrieves the widget props from the UI extensions of a schema node.
 */
export const getWidgetProps = (node: any): Record<string, unknown> | undefined => {
  const ext = extractUiExtensions(node);
  return ext['x-ui-props'] && typeof ext['x-ui-props'] === 'object'
    ? (ext['x-ui-props'] as Record<string, unknown>)
    : undefined;
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
  | 'link'
  | 'unknown';

/**
 * Determines the schema kind for a field or input.
 */
export const determineSchemaKind = (name: string, node: any): SchemaKind => {
  if (!node || typeof node !== 'object') return 'unknown';

  if (name === 'id' || getWidgetId(node) === 'link') {
    return 'link';
  }

  if (node.kind) {
    return node.kind as SchemaKind;
  }

  if ((Array.isArray(node.oneOf) && node.oneOf.length > 0) || (Array.isArray(node.anyOf) && node.anyOf.length > 0)) {
    return 'polymorphic';
  }

  if (node.type === 'object' && node.properties) {
    return 'object';
  }

  if (node.type === 'array') {
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

/**
 * Extracts validation rules from a schema node.
 */
export const extractValidation = (schema: any): Record<string, any> | undefined => {
  if (!schema || typeof schema !== 'object') return undefined;

  const validation: Record<string, any> = {};
  if (schema.minLength !== undefined) validation.minLength = schema.minLength;
  if (schema.maxLength !== undefined) validation.maxLength = schema.maxLength;
  if (schema.minimum !== undefined) validation.minimum = schema.minimum;
  if (schema.maximum !== undefined) validation.maximum = schema.maximum;
  if (schema.pattern) validation.pattern = schema.pattern;

  return Object.keys(validation).length ? validation : undefined;
};

/**
 * Extracts the list properties from an array schema.
 */
export const extractListProperties = (schema: any): Record<string, any> => {
  if (!schema || typeof schema !== 'object') return {};
  const normalizedRoot = normalizeSchema(schema) || schema;

  if (normalizedRoot.type === 'array' && normalizedRoot.items) {
    const normalizedItems = normalizeSchema(normalizedRoot.items);
    if (normalizedItems?.properties) {
      return normalizedItems.properties;
    }
  }

  const wrapperItems = normalizedRoot.properties?.items?.items;
  if (wrapperItems) {
    const normalizedWrapperItems = normalizeSchema(wrapperItems);
    if (normalizedWrapperItems?.properties) {
      return normalizedWrapperItems.properties;
    }
  }

  const wrapperData = normalizedRoot.properties?.data?.items;
  if (wrapperData) {
    const normalizedWrapperData = normalizeSchema(wrapperData);
    if (normalizedWrapperData?.properties) {
      return normalizedWrapperData.properties;
    }
  }

  if (normalizedRoot.properties) {
    return normalizedRoot.properties;
  }

  return {};
};
