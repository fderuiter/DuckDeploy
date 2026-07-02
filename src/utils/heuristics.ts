/**
 * Generated description.
 *
 */
export const isReferenceField = (name: string): boolean => {
  return name.endsWith('_id') || name.endsWith('Id');
};

/**
 * Generated description.
 *
 */
export const getReferenceTarget = (name: string): string => {
  return name.replace(/_id$/i, '').replace(/Id$/, '');
};

/**
 * Generates a human-readable label from a property key (camelCase, snake_case, kebab-case).
 */
export const generateHeuristicLabel = (key: string): string => {
  if (!key) return '';
  const words = key
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
 * Falls back to heuristic labels if title is missing.
 */
export const extractMetadata = (node: any, sourceName: string) => {
  const isHeuristicTitle = !node?.title;
  const title = isHeuristicTitle ? generateHeuristicLabel(sourceName) : node.title;
  const description = node?.description;
  return { title, description, isHeuristicTitle };
};

/**
 * Extracts all UI extension metadata from a schema node.
 * This looks for any property starting with 'x-ui-' and aggregates them.
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
 * Generated description.
 *
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
 * Generated description.
 *
 */
export const getWidgetId = (node: any): string | undefined => {
  const ext = extractUiExtensions(node);
  return typeof ext['x-ui-widget'] === 'string' ? ext['x-ui-widget'] : undefined;
};

/**
 * Generated description.
 *
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
 * Determines the primary data kind of a schema field by traversing its properties.
 * 
 * Conditional Path Explanation:
 * 1. Link / ID Check: If the field is named "id" or explicitly marked with widget="link", it's treated as a link.
 * 2. Pre-computed Kind: If the node already has a `kind` field (e.g. from the AST walker), it uses that.
 * 3. Polymorphism: If `oneOf` or `anyOf` are present, it implies multiple possible types (polymorphism).
 * 4. Structured Data: Checks for explicit 'object' or 'array' types.
 * 5. References: Checks if the name implies a relationship (e.g. ending in "_id") or has an OpenAPI `$ref`.
 * 6. Primitives: Maps remaining standard OpenAPI primitive types to 'enum', 'boolean', 'number', 'date', or 'text'.
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
