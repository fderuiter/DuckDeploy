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
