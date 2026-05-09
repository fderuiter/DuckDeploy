import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const MAX_REF_DEPTH = 3;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const GENERATED_CLIENT_PATH = path.join(repoRoot, 'src', 'api', 'generated');

const INPUT_CANDIDATES = [
  path.join(repoRoot, 'openapi.yaml'),
  path.join(repoRoot, 'openapi.yml'),
  path.join(repoRoot, 'openapi.json'),
];

const OUTPUT_PATH = path.join(repoRoot, 'public', 'ui-manifest.json');
const TRACEABILITY_OUTPUT_PATH = path.join(repoRoot, 'traceability-matrix.json');
const HASH_OUTPUT_PATH = path.join(repoRoot, 'public', 'ui-manifest.sha256');
const STABLE_JSON_EOL = '\n';

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

const escapeJsonPointer = (segment) =>
  String(segment)
    .replace(/~/g, '~0')
    .replace(/\//g, '~1');

const extractUiExtensions = (node) => {
  if (!node || typeof node !== 'object') return {};

  return Object.keys(node)
    .filter((key) => key.startsWith('x-ui-'))
    .reduce((acc, key) => {
      acc[key] = node[key];
      return acc;
    }, {});
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
    this.traceabilityEntries = [];
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

  addTraceability(pointer, source, component, status = 'mapped') {
    this.traceabilityEntries.push({
      pointer,
      source,
      component,
      status,
    });
  }

  visitFieldNode(name, schema, context = { refDepthMap: {} }, pointer = '#') {
    const normalized = this.normalizeSchema(schema, context);
    const node = normalized.schema;

    if (!node || typeof node !== 'object') {
      this.addTraceability(pointer, name, null, 'discarded');
      return null;
    }

    const uiExtensions = extractUiExtensions(node);
    const hasUiExtensions = Object.keys(uiExtensions).length > 0;
    const base = {
      source: name,
      widgetId: typeof uiExtensions['x-ui-widget'] === 'string' ? uiExtensions['x-ui-widget'] : undefined,
      widgetProps:
        uiExtensions['x-ui-props'] && typeof uiExtensions['x-ui-props'] === 'object' ? uiExtensions['x-ui-props'] : undefined,
      uiExtensions: hasUiExtensions ? uiExtensions : undefined,
    };

    if (name.endsWith('_id') || name.endsWith('Id')) {
      const target = name.replace(/_id$/i, '').replace(/Id$/, '');
      this.addTraceability(pointer, name, '<ReferenceField />');
      return { ...base, kind: 'reference', reference: target };
    }

    if (Array.isArray(node.enum) && node.enum.length > 0) {
      this.addTraceability(pointer, name, '<SelectField />');
      return {
        ...base,
        kind: 'enum',
        choices: node.enum.map((value) => ({ id: String(value), name: String(value) })),
      };
    }

    if (node.type === 'boolean') {
      this.addTraceability(pointer, name, '<BooleanField />');
      return { ...base, kind: 'boolean' };
    }
    if (node.type === 'integer' || node.type === 'number') {
      this.addTraceability(pointer, name, '<NumberField />');
      return { ...base, kind: 'number' };
    }
    if (node.type === 'string' && (node.format === 'date' || node.format === 'date-time')) {
      this.addTraceability(pointer, name, '<DateField />');
      return { ...base, kind: 'date' };
    }
    if (node.type === 'array') {
      this.addTraceability(pointer, name, '<ArrayField />');
      return { ...base, kind: 'array' };
    }

    this.addTraceability(pointer, name, '<TextField />');
    return { ...base, kind: 'text' };
  }

  visitFormNode(source, schema, isRequired, context = { refDepthMap: {} }, depth = 0, pointer = '#') {
    const normalized = this.normalizeSchema(schema, context);
    const node = normalized.schema;

    if (!node || typeof node !== 'object') {
      this.addTraceability(pointer, source, null, 'discarded');
      return null;
    }
    if (depth > this.maxDepth) {
      this.addTraceability(pointer, source, null, 'discarded');
      return null;
    }

    const uiExtensions = extractUiExtensions(node);
    const hasUiExtensions = Object.keys(uiExtensions).length > 0;
    const base = {
      source,
      isRequired,
      title: node.title,
      validation: this.getValidation(node),
      widgetId: typeof uiExtensions['x-ui-widget'] === 'string' ? uiExtensions['x-ui-widget'] : undefined,
      widgetProps:
        uiExtensions['x-ui-props'] && typeof uiExtensions['x-ui-props'] === 'object' ? uiExtensions['x-ui-props'] : undefined,
      uiExtensions: hasUiExtensions ? uiExtensions : undefined,
    };

    if ((Array.isArray(node.oneOf) && node.oneOf.length > 0) || (Array.isArray(node.anyOf) && node.anyOf.length > 0)) {
      const variants = (node.oneOf || node.anyOf)
        .map((variant, index) => {
          const variantPointer = `${pointer}/${node.oneOf ? 'oneOf' : 'anyOf'}/${index}`;
          const variantNode = this.visitFormNode(source, variant, isRequired, normalized.context, depth + 1, variantPointer);
          if (!variantNode) return null;
          return {
            label: variantNode.title || `Option ${index + 1}`,
            node: variantNode,
          };
        })
        .filter(Boolean);

      if (variants.length > 0) {
        this.addTraceability(pointer, source, '<PolymorphicInput />');
        return { ...base, kind: 'polymorphic', options: variants };
      }
    }

    if (node.type === 'object' && node.properties) {
      const children = Object.entries(node.properties)
        .map(([subName, subSchema]) => {
          const nestedSource = source ? `${source}.${subName}` : subName;
          const childRequired = (node.required || []).includes(subName);
          const childPointer = `${pointer}/properties/${escapeJsonPointer(subName)}`;
          return this.visitFormNode(nestedSource, subSchema, childRequired, normalized.context, depth + 1, childPointer);
        })
        .filter(Boolean);

      this.addTraceability(pointer, source || '(root)', '<ObjectGroup />');
      return { ...base, kind: 'object', children };
    }

    if (node.type === 'array' && node.items) {
      const itemNode = this.visitFormNode('', node.items, false, normalized.context, depth + 1, `${pointer}/items`);
      this.addTraceability(pointer, source, '<ArrayInput />');
      return { ...base, kind: 'array', items: itemNode ? [itemNode] : [] };
    }

    if (source.endsWith('_id') || source.endsWith('Id')) {
      const target = source.replace(/_id$/i, '').replace(/Id$/, '');
      this.addTraceability(pointer, source, '<ReferenceInput />');
      return { ...base, kind: 'reference', reference: target };
    }

    if (Array.isArray(node.enum) && node.enum.length > 0) {
      this.addTraceability(pointer, source, '<SelectInput />');
      return {
        ...base,
        kind: 'enum',
        choices: node.enum.map((value) => ({ id: String(value), name: String(value) })),
      };
    }

    if (node.type === 'boolean') {
      this.addTraceability(pointer, source, '<BooleanInput />');
      return { ...base, kind: 'boolean' };
    }
    if (node.type === 'integer' || node.type === 'number') {
      this.addTraceability(pointer, source, '<NumberInput />');
      return { ...base, kind: 'number' };
    }
    if (node.type === 'string' && (node.format === 'date' || node.format === 'date-time')) {
      this.addTraceability(pointer, source, '<DateInput />');
      return { ...base, kind: 'date' };
    }

    this.addTraceability(pointer, source, '<TextInput />');
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

const listGeneratedClientFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listGeneratedClientFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entryPath.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
};

const buildGeneratedOperationMap = () => {
  const clients = {};
  const files = listGeneratedClientFiles(GENERATED_CLIENT_PATH).filter(
    (filePath) => !filePath.includes(`${path.sep}model${path.sep}`),
  );
  if (files.length === 0) {
    throw new Error(
      `No generated API client files found at ${GENERATED_CLIENT_PATH}. Run "npm run generate:api" before build:manifest.`,
    );
  }

  let operationCount = 0;
  // Parse Orval's generated arrow-function operations and extract HTTP method + URL.
  // Expected format (orval v8 axios + tags-split):
  //   const operationName = (...) => { return customInstance(... {url: `/path`, method: 'GET' ...}) }
  // Keep this regex in sync with generated output if Orval generation templates change.
  const operationRegex =
    /(?:^|\n)\s*const\s+([A-Za-z0-9_$]+)\s*=\s*\([\s\S]*?\)\s*=>\s*\{\s*return\s+customInstance<[\s\S]*?>\(\s*\{url:\s*`([^`]+)`\s*,\s*method:\s*'([A-Z]+)'/gm;

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    let match;

    while ((match = operationRegex.exec(source)) !== null) {
      const [, functionName, url, method] = match;
      // Orval emits template placeholders as `${id}`, while OpenAPI paths use `{id}`.
      const normalizedUrl = url.replace(/\$\{([^}]+)\}/g, '{$1}');
      clients[`${method} ${normalizedUrl}`] = functionName;
      operationCount += 1;
    }
  }

  if (files.length > 0 && operationCount === 0) {
    throw new Error('Failed to extract operations from generated Orval clients. Check generated output format.');
  }

  return clients;
};

const buildUiManifest = (spec) => {
  if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
    return {
      manifest: { version: 1, depthLimit: MAX_REF_DEPTH, resources: {} },
      traceabilityEntries: [],
    };
  }

  const visitor = new OpenApiVisitor(spec, MAX_REF_DEPTH);
  const resources = {};
  const generatedOperationMap = buildGeneratedOperationMap();
  const operationFunctionMap = {};

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

      const operationKey =
        typeof operation.operationId === 'string' && operation.operationId.trim().length > 0
          ? operation.operationId
          : `${method.toUpperCase()} ${apiPath}`;
      const generatedFunctionName = generatedOperationMap[`${method.toUpperCase()} ${apiPath}`];
      if (generatedFunctionName) {
        operationFunctionMap[operationKey] = generatedFunctionName;
      }

      if (method === 'get' && !isInstancePath) {
        const listResponseStatus = operation.responses?.['200']?.content
          ? '200'
          : operation.responses?.['201']?.content
            ? '201'
            : null;
        const listSchema = listResponseStatus
          ? getSchemaFromContent(operation.responses?.[listResponseStatus]?.content)
          : null;

        const properties = extractListProperties(listSchema, visitor);
        resources[resourceName].listFields = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFieldNode(
              fieldName,
              propertySchema,
              { refDepthMap: {} },
              `#/paths/${escapeJsonPointer(apiPath)}/${method}/responses/${listResponseStatus || '200'}/content/application~1json/schema/properties/${escapeJsonPointer(fieldName)}`,
            ),
          )
          .filter(Boolean);
      }

      if (method === 'post' && !isInstancePath) {
        const createSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = visitor.normalizeSchema(createSchema, { refDepthMap: {} }).schema || createSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].createForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFormNode(
              fieldName,
              propertySchema,
              required.includes(fieldName),
              { refDepthMap: {} },
              0,
              `#/paths/${escapeJsonPointer(apiPath)}/${method}/requestBody/content/application~1json/schema/properties/${escapeJsonPointer(fieldName)}`,
            ),
          )
          .filter(Boolean);
      }

      if ((method === 'put' || method === 'patch') && isInstancePath) {
        const editSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = visitor.normalizeSchema(editSchema, { refDepthMap: {} }).schema || editSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].editForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFormNode(
              fieldName,
              propertySchema,
              required.includes(fieldName),
              { refDepthMap: {} },
              0,
              `#/paths/${escapeJsonPointer(apiPath)}/${method}/requestBody/content/application~1json/schema/properties/${escapeJsonPointer(fieldName)}`,
            ),
          )
          .filter(Boolean);
      }
    }
  }

  return {
    manifest: {
      version: 1,
      depthLimit: MAX_REF_DEPTH,
      resources,
      operationFunctionMap,
    },
    traceabilityEntries: visitor.traceabilityEntries,
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

  const { manifest, traceabilityEntries } = buildUiManifest(parsed);
  const traceabilityReport = {
    generatedAt: new Date().toISOString(),
    entries: traceabilityEntries,
  };
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}${STABLE_JSON_EOL}`;
  // Keep SHA-256 + lowercase hex aligned with browser-side verification in SpecContext (Web Crypto API).
  // STABLE_JSON_EOL is intentional and must stay stable for deterministic hashing.
  const manifestHash = crypto.createHash('sha256').update(serializedManifest, 'utf8').digest('hex');

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, serializedManifest, 'utf8');
  fs.writeFileSync(TRACEABILITY_OUTPUT_PATH, `${JSON.stringify(traceabilityReport, null, 2)}\n`, 'utf8');
  fs.writeFileSync(HASH_OUTPUT_PATH, `${manifestHash}\n`, 'utf8');

  console.log(`Generated ${path.relative(repoRoot, OUTPUT_PATH)} (depth limit: ${MAX_REF_DEPTH})`);
  console.log(`Generated ${path.relative(repoRoot, TRACEABILITY_OUTPUT_PATH)}`);
  console.log(`Generated ${path.relative(repoRoot, HASH_OUTPUT_PATH)}`);
};

try {
  compile();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
