import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  isReferenceField,
  getReferenceTarget,
  extractUiExtensions,
  getPrimaryField,
  getWidgetId,
  getWidgetProps,
  determineSchemaKind,
} from '../src/utils/heuristics.ts';
import { resolveResourceName, getSchemaFromContent, discoverResources, parseAllowedOperations, compileSpec, normalizeSchema, resolveDiscriminator, UnifiedSchemaWalker } from '@duckdeploy/openapi';
import { HTTP_METHODS } from '../src/core/discovery.ts';

/**
 * @typedef {import('../src/core/discovery.ts').ResourceDefinition} ResourceDefinition
 */

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
const DOCS_DIR = path.join(repoRoot, 'docs');

const PROHIBITED_PATTERNS = [
  {
    regex: /schema\.json.*?\(the UI manifest\)/i,
    message: "Terminology Error: 'schema.json' is incorrectly described as the UI manifest. Use 'ui-manifest.json'."
  },
  {
    regex: /generate.*?ui-manifest\.json.*?via Orval/i,
    message: "Architecture Error: Orval does not generate the UI manifest. It generates API clients."
  },
  {
    regex: /Orval.*?generates.*?ui-manifest\.json/i,
    message: "Architecture Error: Orval does not generate the UI manifest. It generates API clients."
  },
  {
    regex: /dynamically based on discovered endpoints/i,
    message: "Architecture Error: Resource discovery is a build-time process, not dynamic runtime discovery."
  }
];

const validateDocsAndInjectMetadata = () => {
  const files = [
    path.join(repoRoot, 'README.md'),
    ...fs.readdirSync(DOCS_DIR).map((file) => path.join(DOCS_DIR, file))
  ].filter((file) => file.endsWith('.md'));

  let totalErrors = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.regex.test(content)) {
        console.error(`\n❌ Validation failed in ${path.relative(repoRoot, file)}`);
        console.error(`   ${pattern.message}`);
        totalErrors++;
      }
    }
  }

  if (totalErrors > 0) {
    throw new Error(`Found ${totalErrors} documentation terminology errors.`);
  }

  const manifestPath = path.join(repoRoot, 'architecture-manifest.json');
  let components = [];
  if (fs.existsSync(manifestPath)) {
    try {
      const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      components = manifestData.components || [];
    } catch (e) {
      console.warn('Failed to parse architecture-manifest.json', e);
    }
  }

  const archFile = path.join(DOCS_DIR, 'architecture.md');
  if (fs.existsSync(archFile)) {
    const content = fs.readFileSync(archFile, 'utf8');
    const metadata = `
### Generated Architecture Metadata
*Automatically updated during build*

- **UI Manifest Generation**: Handled by internal preprocessor (\`scripts/preprocessor.mjs\` and \`@duckdeploy/openapi\`).
- **Resource Discovery Process**: Build-time analysis of OpenAPI paths.
- **API Client Generation**: Handled by Orval.
- **Artifacts Generated**:
  - \`public/ui-manifest.json\`: The UI manifest containing discovered resources and forms.
  - \`public/schema.json\`: The optimized OpenAPI schema.
`;
    let updatedContent = content.replace(
      /<!-- ARCHITECTURE_START -->[\s\S]*?<!-- ARCHITECTURE_END -->/,
      `<!-- ARCHITECTURE_START -->\n${metadata}\n<!-- ARCHITECTURE_END -->`
    );

    let missingMandatory = false;
    const coverage = {};

    for (const comp of components) {
      const metaBlock = `<!-- COMPONENT_${comp.id}_METADATA_START -->\n**Role**: ${comp.metadata.role || 'N/A'}\n**Version**: ${comp.metadata.version || 'N/A'}\n<!-- COMPONENT_${comp.id}_METADATA_END -->`;
      const compStart = `<!-- COMPONENT_${comp.id}_START -->`;
      const compEnd = `<!-- COMPONENT_${comp.id}_END -->`;

      if (updatedContent.includes(compStart)) {
        const regex = new RegExp(`<!-- COMPONENT_${comp.id}_METADATA_START -->[\\s\\S]*?<!-- COMPONENT_${comp.id}_METADATA_END -->`);
        if (regex.test(updatedContent)) {
          updatedContent = updatedContent.replace(regex, metaBlock);
        } else {
          updatedContent = updatedContent.replace(compStart, `${compStart}\n${metaBlock}`);
        }
      } else {
        const block = `\n\n${compStart}\n### ${comp.name}\n\n${metaBlock}\n\n<!-- COMPONENT_${comp.id}_DESCRIPTION_START -->\n<!-- TODO: Add specific implementation details here -->\n<!-- COMPONENT_${comp.id}_DESCRIPTION_END -->\n${compEnd}\n`;
        updatedContent += block;
      }

      const descRegex = new RegExp(`<!-- COMPONENT_${comp.id}_DESCRIPTION_START -->([\\s\\S]*?)<!-- COMPONENT_${comp.id}_DESCRIPTION_END -->`);
      const match = updatedContent.match(descRegex);
      let isDocumented = false;
      if (match) {
        let desc = match[1].replace('<!-- TODO: Add specific implementation details here -->', '').trim();
        if (desc.length > 0) {
          isDocumented = true;
        }
      }

      coverage[comp.id] = {
        name: comp.name,
        documented: isDocumented,
        mandatory: comp.mandatory
      };

      if (comp.mandatory && !isDocumented) {
        console.error(`\n❌ Mandatory component '${comp.name}' (${comp.id}) is undocumented in architecture.md.`);
        missingMandatory = true;
      }
    }

    fs.writeFileSync(path.join(repoRoot, 'docs-coverage-report.json'), JSON.stringify(coverage, null, 2), 'utf8');

    if (content !== updatedContent) {
      fs.writeFileSync(archFile, updatedContent, 'utf8');
      console.log(`Updated architecture metadata in ${path.relative(repoRoot, archFile)}`);
    }

    if (missingMandatory) {
      throw new Error("Build failed: Mandatory architectural components are missing descriptive documentation.");
    }
  }
};

const resolveInputPath = () => INPUT_CANDIDATES.find((candidate) => fs.existsSync(candidate));

const parseSpecRaw = (sourcePath, raw) => {
  if (sourcePath.endsWith('.json')) {
    return JSON.parse(raw);
  }
  return yaml.load(raw);
};

const escapeJsonPointer = (segment) =>
  String(segment)
    .replace(/~/g, '~0')
    .replace(/\//g, '~1');

class OpenApiVisitor {
  constructor(spec) {
    this.spec = spec;
    this.traceabilityEntries = [];
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

  visitFieldNode(name, schema, pointer = '#') {
    const node = normalizeSchema(schema);

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

    const kind = determineSchemaKind(name, node);

    switch (kind) {
      case 'reference':
        this.addTraceability(pointer, name, '<ReferenceField />');
        return { ...base, kind: 'reference', reference: getReferenceTarget(name) };
      case 'enum':
        this.addTraceability(pointer, name, '<SelectField />');
        return { ...base, kind: 'enum', choices: node.enum.map((value) => ({ id: String(value), name: String(value) })) };
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

  visitFormNode(rootSource, rootSchema, rootIsRequired, rootPointer = '#') {
    
    
    const walker = new UnifiedSchemaWalker({
      visitNode: (context, defaultVisit) => {
        const { schema: rawSchema, source, isRequired, pointer } = context;
        const node = normalizeSchema(rawSchema);

        if (!node || typeof node !== 'object') {
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

        const kind = determineSchemaKind(source, node);

        if (kind === 'polymorphic') {
          const variantSchemas = node.oneOf || node.anyOf;
          const strictDiscriminator = node.discriminator ? { propertyName: node.discriminator.propertyName } : null;
          
          const defaultResult = defaultVisit();
          if (!defaultResult || !defaultResult.options) return null;
          
          const options = defaultResult.options.map((variantNode, index) => {
             if (!variantNode) return null;
             const variantRaw = variantSchemas[index];
             const resolvedVariant = {
               label: variantNode.title || `Option ${index + 1}`,
               node: variantNode,
             };
             
             const disc = resolveDiscriminator(node, variantRaw['x-origin-ref']);
             if (disc && disc.values.length > 0) {
               resolvedVariant.discriminatorValue = disc.values[0];
             }
             return resolvedVariant;
          }).filter(Boolean);

          if (options.length > 0) {
            this.addTraceability(pointer, source, '<PolymorphicInput />');
            
            let discriminatorProperty;
            if (strictDiscriminator) discriminatorProperty = strictDiscriminator.propertyName;
            else if (options[0].discriminatorValue) {
                discriminatorProperty = resolveDiscriminator(node, variantSchemas[0]['x-origin-ref'])?.propertyName;
            }

            return {
              ...base,
              kind: 'polymorphic',
              discriminatorProperty,
              options,
            };
          }
          return null;
        }

        if (kind === 'object') {
          this.addTraceability(pointer, source || '(root)', '<ObjectGroup />');
          const defaultResult = defaultVisit();
          return { ...base, kind: 'object', children: defaultResult.children || [] };
        }

        if (kind === 'array') {
          this.addTraceability(pointer, source, '<ArrayInput />');
          const defaultResult = defaultVisit();
          return { ...base, kind: 'array', items: defaultResult.items || [] };
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
    }, { walkPayload: false });

    return walker.walk(rootSchema, undefined, rootSource, rootPointer, rootIsRequired);
  }
}

const extractListProperties = (schema) => {
  if (!schema || typeof schema !== 'object') return {};

  const normalizedRoot = normalizeSchema(schema) || schema;

  if (normalizedRoot.type === 'array' && normalizedRoot.items) {
    const normalizedItems = normalizeSchema(normalizedRoot.items);
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties?.items?.items) {
    const normalizedItems = normalizeSchema(normalizedRoot.properties.items.items);
    if (normalizedItems?.properties) return normalizedItems.properties;
  }

  if (normalizedRoot.properties?.data?.items) {
    const normalizedItems = normalizeSchema(normalizedRoot.properties.data.items);
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
  const operationRegex =
    /(?:^|\n)\s*const\s+([A-Za-z0-9_$]+)\s*=\s*\([\s\S]*?\)\s*=>\s*\{\s*return\s+customInstance<[\s\S]*?>\(\s*\{url:\s*`([^`]+)`\s*,\s*method:\s*'([A-Z]+)'/gm;

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    let match;

    const relativePath = path.relative(GENERATED_CLIENT_PATH, filePath);
    const modulePath = `../api/generated/${relativePath.replace(/\\/g, '/')}`;

    while ((match = operationRegex.exec(source)) !== null) {
      const [, functionName, url, method] = match;
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
      manifest: { version: 1, depthLimit: 0, resources: {} },
      traceabilityEntries: [],
    };
  }

  const visitor = new OpenApiVisitor(spec);
  /** @type {Record<string, ResourceDefinition>} */
  const resources = {};
  const discovered = discoverResources(spec);
  const discoveredByName = new Map(discovered.map(d => [d.name, d]));
  const allowedOperations = parseAllowedOperations(spec).map(op => ({
    pattern: op.pattern.source,
    methods: Array.from(op.methods),
  }));
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
      const discoveredResource = discoveredByName.get(resourceName);
      
      const resourceSchema = spec.components?.schemas?.[resourceName];
      let primaryField;
      if (resourceSchema) {
        primaryField = getPrimaryField(resourceSchema);
        if (!primaryField && resourceSchema.properties) {
          const propKeys = Object.keys(resourceSchema.properties);
          for (const key of propKeys) {
            if (resourceSchema.properties[key]?.['x-ui-primary-field'] === true) {
              primaryField = key;
              break;
            }
          }
        }
      }

      resources[resourceName] = {
        name: resourceName,
        primaryField,
        hasList: discoveredResource?.hasList ?? false,
        hasCreate: discoveredResource?.hasCreate ?? false,
        hasShow: discoveredResource?.hasShow ?? false,
        hasEdit: discoveredResource?.hasEdit ?? false,
        hasDelete: discoveredResource?.hasDelete ?? false,
        listPath: discoveredResource?.listPath,
        createPath: discoveredResource?.createPath,
        showPath: discoveredResource?.showPath,
        editPath: discoveredResource?.editPath,
        editMethod: discoveredResource?.editMethod,
        deletePath: discoveredResource?.deletePath,
        listOperationId: discoveredResource?.listOperationId,
        createOperationId: discoveredResource?.createOperationId,
        showOperationId: discoveredResource?.showOperationId,
        editOperationId: discoveredResource?.editOperationId,
        deleteOperationId: discoveredResource?.deleteOperationId,
        listQueryParams: discoveredResource?.listQueryParams ?? [],
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

        const properties = extractListProperties(listSchema);
        resources[resourceName].listFields = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFieldNode(
              fieldName,
              propertySchema,
              `#/paths/${escapeJsonPointer(apiPath)}/${method}/responses/${listResponseStatus || '200'}/content/application~1json/schema/properties/${escapeJsonPointer(fieldName)}`,
            ),
          )
          .filter(Boolean);
      }

      if (method === 'post' && !isInstancePath) {
        const createSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = normalizeSchema(createSchema) || createSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].createForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFormNode(
              fieldName,
              propertySchema,
              required.includes(fieldName),
              `#/paths/${escapeJsonPointer(apiPath)}/${method}/requestBody/content/application~1json/schema/properties/${escapeJsonPointer(fieldName)}`,
            ),
          )
          .filter(Boolean);
      }

      if ((method === 'put' || method === 'patch') && isInstancePath) {
        const editSchema = getSchemaFromContent(operation.requestBody?.content);
        const normalized = normalizeSchema(editSchema) || editSchema;
        const properties = normalized?.properties || {};
        const required = normalized?.required || [];

        resources[resourceName].editForm = Object.entries(properties)
          .map(([fieldName, propertySchema]) =>
            visitor.visitFormNode(
              fieldName,
              propertySchema,
              required.includes(fieldName),
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
      depthLimit: 0,
      resources,
      allowedOperations,
      operationFunctionMap,
    },
    traceabilityEntries: visitor.traceabilityEntries,
  };
};

const compile = async () => {
  const inputPath = resolveInputPath();
  if (!inputPath) {
    throw new Error('No OpenAPI input file found. Expected openapi.yaml, openapi.yml, or openapi.json.');
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsedRaw = parseSpecRaw(inputPath, raw);

  if (!parsedRaw || typeof parsedRaw !== 'object') {
    throw new Error('Invalid OpenAPI document: expected an object root.');
  }

  const parsed = await compileSpec(parsedRaw);

  const { manifest, traceabilityEntries } = buildUiManifest(parsed);
  const manifestGenerationLog = {
    generatedAt: new Date().toISOString(),
    entries: traceabilityEntries,
  };
  const serializedManifest = `${JSON.stringify(manifest, null, 2)}${STABLE_JSON_EOL}`;
  const manifestHash = crypto.createHash('sha256').update(serializedManifest, 'utf8').digest('hex');

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  if (fs.existsSync(LEGACY_TRACEABILITY_OUTPUT_PATH)) {
    fs.unlinkSync(LEGACY_TRACEABILITY_OUTPUT_PATH);
  }
  fs.writeFileSync(OUTPUT_PATH, serializedManifest, 'utf8');
  fs.writeFileSync(MANIFEST_GENERATION_LOG_PATH, `${JSON.stringify(manifestGenerationLog, null, 2)}\n`, 'utf8');
  fs.writeFileSync(HASH_OUTPUT_PATH, `${manifestHash}\n`, 'utf8');

  console.log(`Generated ${path.relative(repoRoot, OUTPUT_PATH)} (depth limit removed)`);
  console.log(`Generated ${path.relative(repoRoot, MANIFEST_GENERATION_LOG_PATH)}`);
  console.log(`Generated ${path.relative(repoRoot, HASH_OUTPUT_PATH)}`);
  
  validateDocsAndInjectMetadata();
};

compile().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
