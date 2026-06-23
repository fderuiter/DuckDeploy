import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  isReferenceField,
  getReferenceTarget,
  extractUiExtensions,
  getWidgetId,
  getWidgetProps,
  determineSchemaKindForField,
  determineSchemaKindForInput,
} from '../src/utils/heuristics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const OPENAPI_PATH = path.join(repoRoot, 'openapi.yaml');
const OUTPUT_PATH = path.join(repoRoot, 'src', 'generated', 'schemaComponentTree.ts');
const MAX_CIRCULAR_REF_DEPTH = 3;

const resolveResourceName = (apiPath, pathItem, methods) => {
  for (const method of methods) {
    if (pathItem[method]?.tags?.length) {
      return pathItem[method].tags[0];
    }
  }

  const segments = apiPath.split('/').filter(Boolean);
  if (!segments.length) return null;
  return segments[0];
};

const getSchemaFromContent = (content) => {
  if (!content || typeof content !== 'object') return null;
  if (content['application/json']?.schema) return content['application/json'].schema;
  const firstMediaType = Object.values(content)[0];
  if (firstMediaType && typeof firstMediaType === 'object' && 'schema' in firstMediaType) {
    return firstMediaType.schema;
  }
  return null;
};

const mergeSchemas = (baseSchema, overrideSchema) => {
  const merged = { ...(baseSchema || {}), ...(overrideSchema || {}) };

  if (baseSchema?.properties || overrideSchema?.properties) {
    merged.properties = {
      ...(baseSchema?.properties || {}),
      ...(overrideSchema?.properties || {}),
    };
  }

  if (baseSchema?.required || overrideSchema?.required) {
    merged.required = Array.from(
      new Set([...(baseSchema?.required || []), ...(overrideSchema?.required || [])]),
    );
  }

  return merged;
};

const extractListProperties = (schema, visitor) => {
  if (!schema || typeof schema !== 'object') return {};
  const normalizedRoot = visitor.normalizeSchema(schema, { refDepthMap: {} }).schema || schema;

  if (normalizedRoot.type === 'array' && normalizedRoot.items) {
    const normalizedItems = visitor.normalizeSchema(normalizedRoot.items, { refDepthMap: {} }).schema;
    if (normalizedItems?.properties) {
      return normalizedItems.properties;
    }
  }

  const wrapperItems = normalizedRoot.properties?.items?.items;
  if (wrapperItems) {
    const normalizedWrapperItems = visitor.normalizeSchema(wrapperItems, { refDepthMap: {} }).schema;
    if (normalizedWrapperItems?.properties) {
      return normalizedWrapperItems.properties;
    }
  }

  const wrapperData = normalizedRoot.properties?.data?.items;
  if (wrapperData) {
    const normalizedWrapperData = visitor.normalizeSchema(wrapperData, { refDepthMap: {} }).schema;
    if (normalizedWrapperData?.properties) {
      return normalizedWrapperData.properties;
    }
  }

  if (normalizedRoot.properties) {
    return normalizedRoot.properties;
  }

  return {};
};

class SchemaAstVisitor {
  constructor(spec, maxCircularRefDepth) {
    this.spec = spec;
    this.maxCircularRefDepth = maxCircularRefDepth;
  }

  getValidation(schema) {
    if (!schema || typeof schema !== 'object') return undefined;

    const validation = {};
    if (schema.minLength !== undefined) validation.minLength = schema.minLength;
    if (schema.maxLength !== undefined) validation.maxLength = schema.maxLength;
    if (schema.minimum !== undefined) validation.minimum = schema.minimum;
    if (schema.maximum !== undefined) validation.maximum = schema.maximum;
    if (schema.pattern) validation.pattern = schema.pattern;

    return Object.keys(validation).length ? validation : undefined;
  }

  resolveRef(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
    const pathParts = ref.slice(2).split('/');
    let current = this.spec;

    for (const segment of pathParts) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        return null;
      }
      current = current[segment];
    }

    return current;
  }

  withRefDepth(context, ref) {
    const refDepthMap = { ...(context.refDepthMap || {}) };
    const currentDepth = (refDepthMap[ref] || 0) + 1;
    if (currentDepth > this.maxCircularRefDepth) {
      return null;
    }

    refDepthMap[ref] = currentDepth;
    return { ...context, refDepthMap };
  }

  normalizeSchema(schema, context) {
    if (!schema || typeof schema !== 'object') return { schema: null, context };

    if (schema.$ref) {
      const nextContext = this.withRefDepth(context, schema.$ref);
      if (!nextContext) return { schema: null, context };

      const resolved = this.resolveRef(schema.$ref);
      if (!resolved || typeof resolved !== 'object') return { schema: null, context: nextContext };

      const { $ref, ...refOverrides } = schema;
      const merged = mergeSchemas(resolved, refOverrides);
      return this.normalizeSchema(merged, nextContext);
    }

    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      const base = {};
      for (const partial of schema.allOf) {
        const normalized = this.normalizeSchema(partial, context);
        if (normalized.schema) {
          Object.assign(base, mergeSchemas(base, normalized.schema));
          context = normalized.context;
        }
      }
      const { allOf, ...rest } = schema;
      return { schema: mergeSchemas(base, rest), context };
    }

    return { schema, context };
  }

  visitFieldNode(name, schema, context = { refDepthMap: {} }) {
    const normalized = this.normalizeSchema(schema, context);
    const node = normalized.schema;
    if (!node) return null;

    const base = { source: name, description: node.description };
    const kind = determineSchemaKindForField(name, node);

    if (kind === 'reference') {
      return { ...base, kind: 'reference', reference: getReferenceTarget(name) };
    }

    if (kind === 'enum') {
      return {
        ...base,
        kind: 'enum',
        choices: node.enum.map((value) => ({ id: String(value), name: String(value) })),
      };
    }

    return { ...base, kind };
  }

  visitFormNode(source, schema, isRequired, context = { refDepthMap: {} }, depth = 0) {
    const normalized = this.normalizeSchema(schema, context);
    const node = normalized.schema;
    if (!node) return null;

    if (depth > this.maxCircularRefDepth) return null;

    const uiExtensions = extractUiExtensions(node);
    const hasUiExtensions = Object.keys(uiExtensions).length > 0;
    const base = {
      source,
      isRequired,
      title: node.title,
      description: node.description,
      validation: this.getValidation(node),
      widgetId: getWidgetId(node),
      widgetProps: getWidgetProps(node),
      uiExtensions: hasUiExtensions ? uiExtensions : undefined,
    };

    const kind = determineSchemaKindForInput(source, node);

    if (kind === 'polymorphic') {
      const options = (node.oneOf || node.anyOf)
        .map((variant, index) => {
          const variantNode = this.visitFormNode(source, variant, isRequired, normalized.context, depth + 1);
          if (!variantNode) return null;
          return {
            label: variantNode.title || `Option ${index + 1}`,
            node: variantNode,
          };
        })
        .filter(Boolean);

      if (options.length > 0) {
        return { ...base, kind: 'polymorphic', options };
      }
    }

    if (kind === 'object') {
      const children = Object.entries(node.properties)
        .map(([subName, subSchema]) => {
          const nestedSource = source ? `${source}.${subName}` : subName;
          const childIsRequired = (node.required || []).includes(subName);
          return this.visitFormNode(nestedSource, subSchema, childIsRequired, normalized.context, depth + 1);
        })
        .filter(Boolean);

      return { ...base, kind: 'object', children };
    }

    if (kind === 'array') {
      const itemNode = this.visitFormNode('', node.items, false, normalized.context, depth + 1);
      return { ...base, kind: 'array', items: itemNode ? [itemNode] : [] };
    }

    if (kind === 'reference') {
      return { ...base, kind: 'reference', reference: getReferenceTarget(source) };
    }

    if (kind === 'enum') {
      return {
        ...base,
        kind: 'enum',
        choices: node.enum.map((value) => ({ id: String(value), name: String(value) })),
      };
    }

    return { ...base, kind };
  }
}

const buildPrecomputedResourceTrees = (spec) => {
  if (!spec || !spec.paths) return {};

  const visitor = new SchemaAstVisitor(spec, MAX_CIRCULAR_REF_DEPTH);
  const resourceTrees = {};

  for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    const methods = Object.keys(pathItem).filter((method) =>
      ['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase()),
    );

    const resourceName = resolveResourceName(apiPath, pathItem, methods);
    if (!resourceName) continue;

    if (!resourceTrees[resourceName]) {
      resourceTrees[resourceName] = {
        createForm: [],
        editForm: [],
        listFields: [],
      };
    }

    const isInstancePath = apiPath.includes('{') && apiPath.endsWith('}');

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      if (method === 'get' && !isInstancePath) {
        const listSchema = getSchemaFromContent(operation.responses?.['200']?.content)
          || getSchemaFromContent(operation.responses?.['201']?.content);
        const properties = extractListProperties(listSchema, visitor);

        resourceTrees[resourceName].listFields = Object.entries(properties)
          .map(([name, propertySchema]) => visitor.visitFieldNode(name, propertySchema))
          .filter(Boolean);
      }

      if (method === 'post' && !isInstancePath) {
        const createSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalizedCreateSchema = visitor.normalizeSchema(createSchema, { refDepthMap: {} }).schema || createSchema;
        const properties = normalizedCreateSchema?.properties || {};
        const required = normalizedCreateSchema?.required || [];

        resourceTrees[resourceName].createForm = Object.entries(properties)
          .map(([name, propertySchema]) =>
            visitor.visitFormNode(name, propertySchema, required.includes(name)),
          )
          .filter(Boolean);
      }

      if ((method === 'put' || method === 'patch') && isInstancePath) {
        const editSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalizedEditSchema = visitor.normalizeSchema(editSchema, { refDepthMap: {} }).schema || editSchema;
        const properties = normalizedEditSchema?.properties || {};
        const required = normalizedEditSchema?.required || [];

        resourceTrees[resourceName].editForm = Object.entries(properties)
          .map(([name, propertySchema]) =>
            visitor.visitFormNode(name, propertySchema, required.includes(name)),
          )
          .filter(Boolean);
      }
    }
  }

  return resourceTrees;
};

const openApiRaw = fs.readFileSync(OPENAPI_PATH, 'utf8');
const parsedSpec = yaml.load(openApiRaw);
const precomputedTree = buildPrecomputedResourceTrees(parsedSpec);

const generatedSource = `// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// Generated by scripts/generate-schema-component-tree.mjs
// This precomputes schema traversal at build time via a strict AST visitor.
// Circular $ref pointers are capped at depth ${MAX_CIRCULAR_REF_DEPTH}.

export const precomputedSchemaComponentTree = ${JSON.stringify(precomputedTree, null, 2)} as const;
`;

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, generatedSource, 'utf8');
console.log(`Generated ${path.relative(repoRoot, OUTPUT_PATH)}`);
