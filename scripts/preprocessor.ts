import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  resolveResourceName,
  getSchemaFromContent,
  HTTP_METHODS,
  MAX_REF_DEPTH,
  BaseSchemaVisitor,
  extractListProperties,
  escapeJsonPointer,
  resolveStrictDiscriminator
} from '@duckdeploy/openapi';

import {
  isReferenceField,
  getReferenceTarget,
  extractUiExtensions,
  getWidgetId,
  getWidgetProps,
  determineSchemaKindForField,
  determineSchemaKindForInput,
} from '@duckdeploy/openapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const GENERATED_CLIENT_PATH = path.join(repoRoot, 'src', 'api', 'generated');

const INPUT_CANDIDATES = [
  path.join(repoRoot, 'openapi.yaml'),
  path.join(repoRoot, 'openapi.yml'),
  path.join(repoRoot, 'openapi.json'),
];

const OUTPUT_PATH = path.join(repoRoot, 'public', 'ui-manifest.json');
const MANIFEST_GENERATION_LOG_PATH = path.join(repoRoot, 'manifest-generation-log.json');
const LEGACY_TRACEABILITY_OUTPUT_PATH = path.join(repoRoot, 'traceability-matrix.json');
const HASH_OUTPUT_PATH = path.join(repoRoot, 'public', 'ui-manifest.sha256');
const STABLE_JSON_EOL = '\n';

const resolveInputPath = () => INPUT_CANDIDATES.find((candidate) => fs.existsSync(candidate));

const parseSpec = (sourcePath, raw) => {
  if (sourcePath.endsWith('.json')) {
    return JSON.parse(raw);
  }
  return yaml.load(raw);
};




const mergeUnique = (base = [], override = []) => Array.from(new Set([...(base || []), ...(override || [])]));



class OpenApiVisitor extends BaseSchemaVisitor {
  traceabilityEntries: any[];

  constructor(spec: any, maxDepth: number) {
    super(spec, maxDepth);
    this.traceabilityEntries = [];
  }

  getValidation(schema: any) {
    if (!schema || typeof schema !== 'object') return undefined;

    const validation: any = {};
    if (schema.minLength !== undefined) validation.minLength = schema.minLength;
    if (schema.maxLength !== undefined) validation.maxLength = schema.maxLength;
    if (schema.minimum !== undefined) validation.minimum = schema.minimum;
    if (schema.maximum !== undefined) validation.maximum = schema.maximum;
    if (schema.pattern) validation.pattern = schema.pattern;

    return Object.keys(validation).length > 0 ? validation : undefined;
  }

  addTraceability(pointer: string, source: string, component: string | null, status: string = 'mapped') {
    this.traceabilityEntries.push({
      pointer,
      source,
      component,
      status,
    });
  }

  visitFieldNode(name: string, schema: any, context: any = { refPath: [] }, pointer: string = '#'): any {
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
      description: node.description,
      widgetId: getWidgetId(node),
      widgetProps: getWidgetProps(node),
      uiExtensions: hasUiExtensions ? uiExtensions : undefined,
    };

    const kind = determineSchemaKindForField(name, node);

    switch (kind) {
      case 'reference':
        this.addTraceability(pointer, name, '<ReferenceField />');
        return { ...base, kind: 'reference', reference: getReferenceTarget(name) };
      case 'enum':
        this.addTraceability(pointer, name, '<SelectField />');
        return { ...base, kind: 'enum', choices: node.enum.map((value: any) => ({ id: String(value), name: String(value) })) };
      case 'boolean':
        this.addTraceability(pointer, name, '<BooleanField />');
        return { ...base, kind: 'boolean' };
      case 'number':
        this.addTraceability(pointer, name, '<NumberField />');
        return { ...base, kind: 'number' };
      case 'date':
        this.addTraceability(pointer, name, '<DateField />');
        return { ...base, kind: 'date' };
      case 'array':
        this.addTraceability(pointer, name, '<ArrayField />');
        return { ...base, kind: 'array' };
      default:
        this.addTraceability(pointer, name, '<TextField />');
        return { ...base, kind: 'text' };
    }
  }

  visitFormNode(source: string, schema: any, isRequired: boolean, context: any = { refPath: [] }, depth: number = 0, pointer: string = '#'): any {
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
      description: node.description,
      validation: this.getValidation(node),
      widgetId: getWidgetId(node),
      widgetProps: getWidgetProps(node),
      uiExtensions: hasUiExtensions ? uiExtensions : undefined,
    };

    const kind = determineSchemaKindForInput(source, node);

    if (kind === 'polymorphic') {
      const variantSchemas = node.oneOf || node.anyOf;
      const strictDiscriminator = resolveStrictDiscriminator(node, variantSchemas);
      const variants = variantSchemas
        .map((variant, index) => {
          const variantPointer = `${pointer}/${node.oneOf ? 'oneOf' : 'anyOf'}/${index}`;
          const variantNode = this.visitFormNode(source, variant, isRequired, normalized.context, depth + 1, variantPointer);
          if (!variantNode) return null;
          const resolvedVariant = {
            label: variantNode.title || `Option ${index + 1}`,
            node: variantNode,
          };
          if (strictDiscriminator) {
            resolvedVariant.discriminatorValue = strictDiscriminator.values[index];
          }
          return resolvedVariant;
        })
        .filter(Boolean);

      if (variants.length > 0) {
        this.addTraceability(pointer, source, '<PolymorphicInput />');
        return {
          ...base,
          kind: 'polymorphic',
          discriminatorProperty: strictDiscriminator?.propertyName,
          options: variants,
        };
      }
    }

    if (kind === 'object') {
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

    if (kind === 'array') {
      const itemNode = this.visitFormNode('', node.items, false, normalized.context, depth + 1, `${pointer}/items`);
      this.addTraceability(pointer, source, '<ArrayInput />');
      return { ...base, kind: 'array', items: itemNode ? [itemNode] : [] };
    }

    switch (kind) {
      case 'reference':
        this.addTraceability(pointer, source, '<ReferenceInput />');
        return { ...base, kind: 'reference', reference: getReferenceTarget(source) };
      case 'enum':
        this.addTraceability(pointer, source, '<SelectInput />');
        return { ...base, kind: 'enum', choices: node.enum.map((value) => ({ id: String(value), name: String(value) })) };
      case 'boolean':
        this.addTraceability(pointer, source, '<BooleanInput />');
        return { ...base, kind: 'boolean' };
      case 'number':
        this.addTraceability(pointer, source, '<NumberInput />');
        return { ...base, kind: 'number' };
      case 'date':
        this.addTraceability(pointer, source, '<DateInput />');
        return { ...base, kind: 'date' };
      default:
        this.addTraceability(pointer, source, '<TextInput />');
        return { ...base, kind: 'text' };
    }
  }
}


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

    const relativePath = path.relative(GENERATED_CLIENT_PATH, filePath);
    const modulePath = `../api/generated/${relativePath.replace(/\\/g, '/')}`;

    while ((match = operationRegex.exec(source)) !== null) {
      const [, functionName, url, method] = match;
      // Orval emits template placeholders as `${id}`, while OpenAPI paths use `{id}`.
      const normalizedUrl = url.replace(/\$\{([^}]+)\}/g, '{$1}');
      clients[`${method} ${normalizedUrl}`] = {
        functionName,
        modulePath,
      };
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
              { refPath: [] },
              `#/paths/${escapeJsonPointer(apiPath)}/${method}/responses/${listResponseStatus || '200'}/content/application~1json/schema/properties/${escapeJsonPointer(fieldName)}`,
            ),
          )
          .filter(Boolean);
      }

      if (method === 'post' && !isInstancePath) {
        const createSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = visitor.normalizeSchema(createSchema, { refPath: [] }).schema || createSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].createForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFormNode(
              fieldName,
              propertySchema,
              required.includes(fieldName),
              { refPath: [] },
              0,
              `#/paths/${escapeJsonPointer(apiPath)}/${method}/requestBody/content/application~1json/schema/properties/${escapeJsonPointer(fieldName)}`,
            ),
          )
          .filter(Boolean);
      }

      if ((method === 'put' || method === 'patch') && isInstancePath) {
        const editSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = visitor.normalizeSchema(editSchema, { refPath: [] }).schema || editSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].editForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFormNode(
              fieldName,
              propertySchema,
              required.includes(fieldName),
              { refPath: [] },
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
  const manifestGenerationLog = {
    generatedAt: new Date().toISOString(),
    entries: traceabilityEntries,
  };
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}${STABLE_JSON_EOL}`;
  // STABLE_JSON_EOL is intentional and must stay stable for deterministic hashing.
  // This hash is emitted as build metadata (ui-manifest.sha256) for CI/artifact traceability.
  const manifestHash = crypto.createHash('sha256').update(serializedManifest, 'utf8').digest('hex');

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  if (fs.existsSync(LEGACY_TRACEABILITY_OUTPUT_PATH)) {
    fs.unlinkSync(LEGACY_TRACEABILITY_OUTPUT_PATH);
  }
  fs.writeFileSync(OUTPUT_PATH, serializedManifest, 'utf8');
  fs.writeFileSync(MANIFEST_GENERATION_LOG_PATH, `${JSON.stringify(manifestGenerationLog, null, 2)}\n`, 'utf8');
  fs.writeFileSync(HASH_OUTPUT_PATH, `${manifestHash}\n`, 'utf8');

  console.log(`Generated ${path.relative(repoRoot, OUTPUT_PATH)} (depth limit: ${MAX_REF_DEPTH})`);
  console.log(`Generated ${path.relative(repoRoot, MANIFEST_GENERATION_LOG_PATH)}`);
  console.log(`Generated ${path.relative(repoRoot, HASH_OUTPUT_PATH)}`);
};

try {
  compile();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
