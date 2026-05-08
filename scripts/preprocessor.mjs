import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const MAX_REF_DEPTH = 3;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

const INPUT_CANDIDATES = [
  path.join(repoRoot, 'openapi.yaml'),
  path.join(repoRoot, 'openapi.yml'),
  path.join(repoRoot, 'openapi.json'),
];

const OUTPUT_PATH = path.join(repoRoot, 'public', 'ui-manifest.json');

const resolveInputPath = () => INPUT_CANDIDATES.find((candidate) => fs.existsSync(candidate));

const parseSpec = (sourcePath, raw) => {
  if (sourcePath.endsWith('.json')) {
    return JSON.parse(raw);
  }
  return yaml.load(raw);
};

const resolveRefPath = (spec, ref) => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;

  const parts = ref.slice(2).split('/');
  let current = spec;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return null;
    }
    current = current[part];
  }

  return current;
};

const mergeSchema = (baseSchema, overrideSchema) => {
  const merged = { ...(baseSchema || {}), ...(overrideSchema || {}) };

  if (baseSchema?.properties || overrideSchema?.properties) {
    merged.properties = {
      ...(baseSchema?.properties || {}),
      ...(overrideSchema?.properties || {}),
    };
  }

  if (baseSchema?.required || overrideSchema?.required) {
    merged.required = Array.from(new Set([...(baseSchema?.required || []), ...(overrideSchema?.required || [])]));
  }

  return merged;
};

class OpenApiVisitor {
  constructor(spec, maxDepth) {
    this.spec = spec;
    this.maxDepth = maxDepth;
  }

  withRefDepth(context, ref) {
    const refDepthMap = { ...(context.refDepthMap || {}) };
    const nextDepth = (refDepthMap[ref] || 0) + 1;

    if (nextDepth > this.maxDepth) {
      return {
        context,
        stop: true,
        marker: {
          'x-lazy-ref': ref,
          'x-max-depth-reached': true,
        },
      };
    }

    refDepthMap[ref] = nextDepth;
    return {
      context: { ...context, refDepthMap },
      stop: false,
      marker: null,
    };
  }

  normalizeSchema(schema, context = { refDepthMap: {} }) {
    if (!schema || typeof schema !== 'object') {
      return { schema: null, context };
    }

    if (schema.$ref) {
      const depthState = this.withRefDepth(context, schema.$ref);
      if (depthState.stop) {
        return { schema: depthState.marker, context };
      }

      const resolved = resolveRefPath(this.spec, schema.$ref);
      if (!resolved || typeof resolved !== 'object') {
        return { schema: null, context: depthState.context };
      }

      const { $ref, ...overrides } = schema;
      const merged = mergeSchema(resolved, overrides);
      return this.normalizeSchema(merged, depthState.context);
    }

    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      let accumulator = {};
      let nextContext = context;

      for (const partial of schema.allOf) {
        const normalized = this.normalizeSchema(partial, nextContext);
        if (normalized.schema) {
          accumulator = mergeSchema(accumulator, normalized.schema);
        }
        nextContext = normalized.context;
      }

      const { allOf, ...rest } = schema;
      return { schema: mergeSchema(accumulator, rest), context: nextContext };
    }

    return { schema, context };
  }

  getValidation(schema) {
    if (!schema || typeof schema !== 'object') return undefined;

    const validation = {};
    if (schema.minLength !== undefined) validation.minLength = schema.minLength;
    if (schema.maxLength !== undefined) validation.maxLength = schema.maxLength;
    if (schema.minimum !== undefined) validation.minimum = schema.minimum;
    if (schema.maximum !== undefined) validation.maximum = schema.maximum;
    if (schema.pattern) validation.pattern = schema.pattern;

    return Object.keys(validation).length > 0 ? validation : undefined;
  }

  visitFieldNode(name, schema, context = { refDepthMap: {} }) {
    const normalized = this.normalizeSchema(schema, context);
    const node = normalized.schema;

    if (!node || typeof node !== 'object') return null;

    const base = {
      source: name,
      widgetId: typeof node['x-ui-override'] === 'string' ? node['x-ui-override'] : undefined,
    };

    if (name.endsWith('_id') || name.endsWith('Id')) {
      const target = name.replace(/_id$/i, '').replace(/Id$/, '');
      return { ...base, kind: 'reference', reference: target };
    }

    if (Array.isArray(node.enum) && node.enum.length > 0) {
      return {
        ...base,
        kind: 'enum',
        choices: node.enum.map((value) => ({ id: String(value), name: String(value) })),
      };
    }

    if (node.type === 'boolean') return { ...base, kind: 'boolean' };
    if (node.type === 'integer' || node.type === 'number') return { ...base, kind: 'number' };
    if (node.type === 'string' && (node.format === 'date' || node.format === 'date-time')) return { ...base, kind: 'date' };
    if (node.type === 'array') return { ...base, kind: 'array' };

    return { ...base, kind: 'text' };
  }

  visitFormNode(source, schema, isRequired, context = { refDepthMap: {} }, depth = 0) {
    const normalized = this.normalizeSchema(schema, context);
    const node = normalized.schema;

    if (!node || typeof node !== 'object') return null;
    if (depth > this.maxDepth) return null;

    const base = {
      source,
      isRequired,
      title: node.title,
      validation: this.getValidation(node),
      widgetId: typeof node['x-ui-override'] === 'string' ? node['x-ui-override'] : undefined,
    };

    if (node['x-widget'] === 'json-editor') {
      return { ...base, kind: 'custom_json_editor' };
    }

    if (node['x-widget'] === 'cdisc-terminology-lookup') {
      return {
        ...base,
        kind: 'custom_terminology_lookup',
        domain: node['x-terminology-domain'],
      };
    }

    if ((Array.isArray(node.oneOf) && node.oneOf.length > 0) || (Array.isArray(node.anyOf) && node.anyOf.length > 0)) {
      const variants = (node.oneOf || node.anyOf)
        .map((variant, index) => {
          const variantNode = this.visitFormNode(source, variant, isRequired, normalized.context, depth + 1);
          if (!variantNode) return null;
          return {
            label: variantNode.title || `Option ${index + 1}`,
            node: variantNode,
          };
        })
        .filter(Boolean);

      if (variants.length > 0) {
        return { ...base, kind: 'polymorphic', options: variants };
      }
    }

    if (node.type === 'object' && node.properties) {
      const children = Object.entries(node.properties)
        .map(([subName, subSchema]) => {
          const nestedSource = source ? `${source}.${subName}` : subName;
          const childRequired = (node.required || []).includes(subName);
          return this.visitFormNode(nestedSource, subSchema, childRequired, normalized.context, depth + 1);
        })
        .filter(Boolean);

      return { ...base, kind: 'object', children };
    }

    if (node.type === 'array' && node.items) {
      const itemNode = this.visitFormNode('', node.items, false, normalized.context, depth + 1);
      return { ...base, kind: 'array', items: itemNode ? [itemNode] : [] };
    }

    if (source.endsWith('_id') || source.endsWith('Id')) {
      const target = source.replace(/_id$/i, '').replace(/Id$/, '');
      return { ...base, kind: 'reference', reference: target };
    }

    if (Array.isArray(node.enum) && node.enum.length > 0) {
      return {
        ...base,
        kind: 'enum',
        choices: node.enum.map((value) => ({ id: String(value), name: String(value) })),
      };
    }

    if (node.type === 'boolean') return { ...base, kind: 'boolean' };
    if (node.type === 'integer' || node.type === 'number') return { ...base, kind: 'number' };
    if (node.type === 'string' && (node.format === 'date' || node.format === 'date-time')) return { ...base, kind: 'date' };

    return { ...base, kind: 'text' };
  }
}

const resolveResourceName = (apiPath, pathItem, methods) => {
  for (const method of methods) {
    if (pathItem[method]?.tags?.length) return pathItem[method].tags[0];
  }

  const segments = apiPath.split('/').filter(Boolean);
  return segments.length > 0 ? segments[0] : null;
};

const getSchemaFromContent = (content) => {
  if (!content || typeof content !== 'object') return null;
  if (content['application/json']?.schema) return content['application/json'].schema;
  const firstMedia = Object.values(content)[0];
  if (firstMedia && typeof firstMedia === 'object' && 'schema' in firstMedia) {
    return firstMedia.schema;
  }
  return null;
};

const extractListProperties = (schema, visitor) => {
  if (!schema || typeof schema !== 'object') return {};

  const normalizedRoot = visitor.normalizeSchema(schema, { refDepthMap: {} }).schema || schema;

  if (normalizedRoot.type === 'array' && normalizedRoot.items) {
    const normalizedItems = visitor.normalizeSchema(normalizedRoot.items, { refDepthMap: {} }).schema;
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties?.items?.items) {
    const normalizedItems = visitor.normalizeSchema(normalizedRoot.properties.items.items, { refDepthMap: {} }).schema;
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties?.data?.items) {
    const normalizedItems = visitor.normalizeSchema(normalizedRoot.properties.data.items, { refDepthMap: {} }).schema;
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties) return normalizedRoot.properties;

  return {};
};

const buildUiManifest = (spec) => {
  if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
    return { version: 1, depthLimit: MAX_REF_DEPTH, resources: {} };
  }

  const visitor = new OpenApiVisitor(spec, MAX_REF_DEPTH);
  const resources = {};

  for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    const methods = Object.keys(pathItem)
      .map((method) => method.toLowerCase())
      .filter((method) => HTTP_METHODS.has(method));

    if (methods.length === 0) continue;

    const resourceName = resolveResourceName(apiPath, pathItem, methods);
    if (!resourceName) continue;

    if (!resources[resourceName]) {
      resources[resourceName] = {
        createForm: [],
        editForm: [],
        listFields: [],
      };
    }

    const isInstancePath = apiPath.includes('{') && apiPath.endsWith('}');

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') continue;

      if (method === 'get' && !isInstancePath) {
        const listSchema =
          getSchemaFromContent(operation.responses?.['200']?.content) ||
          getSchemaFromContent(operation.responses?.['201']?.content);

        const properties = extractListProperties(listSchema, visitor);
        resources[resourceName].listFields = Object.entries(properties)
          .map(([fieldName, propertySchema]) => visitor.visitFieldNode(fieldName, propertySchema))
          .filter(Boolean);
      }

      if (method === 'post' && !isInstancePath) {
        const createSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = visitor.normalizeSchema(createSchema, { refDepthMap: {} }).schema || createSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].createForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) => visitor.visitFormNode(fieldName, propertySchema, required.includes(fieldName)))
          .filter(Boolean);
      }

      if ((method === 'put' || method === 'patch') && isInstancePath) {
        const editSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = visitor.normalizeSchema(editSchema, { refDepthMap: {} }).schema || editSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].editForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) => visitor.visitFormNode(fieldName, propertySchema, required.includes(fieldName)))
          .filter(Boolean);
      }
    }
  }

  return {
    version: 1,
    depthLimit: MAX_REF_DEPTH,
    resources,
  };
};

const compile = () => {
  const inputPath = resolveInputPath();
  if (!inputPath) {
    throw new Error('No OpenAPI input file found. Expected openapi.yaml, openapi.yml, or openapi.json.');
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = parseSpec(inputPath, raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid OpenAPI document: expected an object root.');
  }

  const manifest = buildUiManifest(parsed);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Generated ${path.relative(repoRoot, OUTPUT_PATH)} (depth limit: ${MAX_REF_DEPTH})`);
};

try {
  compile();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
