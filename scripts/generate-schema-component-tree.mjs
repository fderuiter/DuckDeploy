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
import { resolveResourceName, compileSpec, normalizeSchema } from '@duckdeploy/openapi';
import { HTTP_METHODS } from '../src/core/discovery.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const OPENAPI_PATH = path.join(repoRoot, 'openapi.yaml');
const OUTPUT_PATH = path.join(repoRoot, 'src', 'generated', 'schemaComponentTree.ts');

const getSchemaFromContent = (content) => {
  if (!content || typeof content !== 'object') return null;
  if (content['application/json']?.schema) return content['application/json'].schema;
  const firstMediaType = Object.values(content)[0];
  if (firstMediaType && typeof firstMediaType === 'object' && 'schema' in firstMediaType) {
    return firstMediaType.schema;
  }
  return null;
};

const extractListProperties = (schema) => {
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

class SchemaAstVisitor {
  constructor(spec) {
    this.spec = spec;
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

  visitFieldNode(name, schema) {
    const node = normalizeSchema(schema);
    if (!node) return null;

    const kind = determineSchemaKindForField(name, node);

    if (kind === 'reference') {
      return { kind: 'reference', source: name, reference: getReferenceTarget(name) };
    }

    if (kind === 'enum') {
      return {
        kind: 'enum',
        source: name,
        choices: node.enum.map((value) => ({ id: String(value), name: String(value) })),
      };
    }

    return { kind, source: name };
  }

  visitFormNode(source, schema, isRequired) {
    const node = normalizeSchema(schema);
    if (!node) return null;

    const uiExtensions = extractUiExtensions(node);
    const hasUiExtensions = Object.keys(uiExtensions).length > 0;
    const base = {
      source,
      isRequired,
      title: node.title,
      validation: this.getValidation(node),
      widgetId: getWidgetId(node),
      widgetProps: getWidgetProps(node),
      uiExtensions: hasUiExtensions ? uiExtensions : undefined,
    };

    const kind = determineSchemaKindForInput(source, node);

    if (kind === 'polymorphic') {
      const options = (node.oneOf || node.anyOf)
        .map((variant, index) => {
          const variantNode = this.visitFormNode(source, variant, isRequired);
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
      const children = Object.entries(node.properties || {})
        .map(([subName, subSchema]) => {
          const nestedSource = source ? `${source}.${subName}` : subName;
          const childIsRequired = (node.required || []).includes(subName);
          return this.visitFormNode(nestedSource, subSchema, childIsRequired);
        })
        .filter(Boolean);

      return { ...base, kind: 'object', children };
    }

    if (kind === 'array') {
      const itemNode = this.visitFormNode('', node.items, false);
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

  const visitor = new SchemaAstVisitor(spec);
  const resourceTrees = {};

  for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    const methods = Object.keys(pathItem).filter((method) =>
      HTTP_METHODS.has(method.toLowerCase()),
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
        const properties = extractListProperties(listSchema);

        resourceTrees[resourceName].listFields = Object.entries(properties)
          .map(([name, propertySchema]) => visitor.visitFieldNode(name, propertySchema))
          .filter(Boolean);
      }

      if (method === 'post' && !isInstancePath) {
        const createSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalizedCreateSchema = normalizeSchema(createSchema) || createSchema;
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
        const normalizedEditSchema = normalizeSchema(editSchema) || editSchema;
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

const compile = async () => {
  const openApiRaw = fs.readFileSync(OPENAPI_PATH, 'utf8');
  const parsedSpecRaw = yaml.load(openApiRaw);
  const parsedSpec = await compileSpec(parsedSpecRaw);
  const precomputedTree = buildPrecomputedResourceTrees(parsedSpec);

  const generatedSource = `// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// Generated by scripts/generate-schema-component-tree.mjs
// This precomputes schema traversal at build time via a strict AST visitor.
// Circular $ref pointers are ignored.

export const precomputedSchemaComponentTree = ${JSON.stringify(precomputedTree, null, 2)} as const;
`;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, generatedSource, 'utf8');
  console.log(`Generated ${path.relative(repoRoot, OUTPUT_PATH)}`);
};

compile().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
