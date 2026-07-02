import { validateEnv } from '../scripts/config/validate.mjs';
const config = validateEnv('backend');
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { isOperationAllowed as libIsOperationAllowed } from '@duckdeploy/openapi';
import Ajv from 'ajv';

const PORT = config.PORT;
const PROXY_PREFIX = normalizePrefix(config.CDISC_PROXY_PREFIX);
const HEALTH_PATH = `${PROXY_PREFIX}/__duckdeploy/health`;
const MAX_REQUEST_BODY_BYTES = config.CDISC_PROXY_MAX_BODY_BYTES;
const REQUEST_TIMEOUT_MS = config.CDISC_PROXY_TIMEOUT_MS;
const PROXY_ALLOWED_HEADERS = ['Accept', 'Accept-Language', 'Content-Type', 'If-Match', 'If-None-Match', 'Prefer', 'Range'];
const NORMALIZED_PROXY_ALLOWED_HEADERS = PROXY_ALLOWED_HEADERS.map((header) => header.toLowerCase());

const BASE_PROXY_ALLOWED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'etag', 'last-modified', 'cache-control', 'content-range', 'x-total-count', 'www-authenticate'];
const additionalAllowedHeaders = (config.PROXY_ALLOWED_HEADERS || '')
  .split(',')
  .map((header) => header.trim().toLowerCase())
  .filter(Boolean);
const PROXY_ALLOWED_RESPONSE_HEADERS = [...new Set([...BASE_PROXY_ALLOWED_RESPONSE_HEADERS, ...additionalAllowedHeaders])];

const TRUSTED_INGRESS_HEADER_NAME = normalizeHeaderName(config.CDISC_TRUSTED_INGRESS_HEADER_NAME);
const TRUSTED_INGRESS_HEADER_VALUE = normalizeHeaderValue(config.CDISC_TRUSTED_INGRESS_HEADER_VALUE);
const configuredOrigins = new Set(config.CDISC_ALLOWED_ORIGINS.split(',').map((entry) => entry.trim()).filter(Boolean));
const allowUntrustedOrigins = config.CDISC_ALLOW_UNTRUSTED_ORIGINS;
let UPSTREAM_BASE_URL;
try {
  UPSTREAM_BASE_URL = new URL(config.CDISC_UPSTREAM_BASE_URL);
} catch (error) {
  throw new Error(`Invalid CDISC_UPSTREAM_BASE_URL: ${config.CDISC_UPSTREAM_BASE_URL}`, { cause: error });
}

const MANIFEST_URL = new URL('../public/ui-manifest.json', import.meta.url);
const SCHEMA_URL = new URL('../public/schema.json', import.meta.url);

async function loadAllowedOperations(manifestUrl) {
  const source = await readFile(manifestUrl, 'utf8');
  const parsed = JSON.parse(source);
  return parsed.allowedOperations.map((op) => ({
    pattern: new RegExp(op.pattern),
    methods: new Set(op.methods)
  }));
}

const allowedOperations = await loadAllowedOperations(MANIFEST_URL);

const routeValidators = [];
async function loadRouteValidators(schemaUrl) {
  const source = await readFile(schemaUrl, 'utf8');
  const openapiSchema = JSON.parse(source);
  const ajv = new Ajv({ strict: false, coerceTypes: false, logger: false });
  ajv.addSchema(openapiSchema, "root");
  const paths = openapiSchema.paths || {};

  const pathToRegExp = (pathTemplate) => {
    const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\\\{.*?\\\}/g, '[^/]+')}$`);
  };

  for (const [pathTemplate, pathItem] of Object.entries(paths)) {
    const pattern = pathToRegExp(pathTemplate);
    const pathPointer = pathTemplate.replace(/~/g, '~0').replace(/\//g, '~1');
    for (const [method, operation] of Object.entries(pathItem)) {
      if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method.toLowerCase())) {
        let requestValidator = null;
        if (operation.requestBody?.content?.['application/json']?.schema) {
          requestValidator = ajv.compile({
            $ref: `root#/paths/${pathPointer}/${method}/requestBody/content/application~1json/schema`
          });
        }

        const responseValidators = {};
        if (operation.responses) {
          for (const [statusCode, response] of Object.entries(operation.responses)) {
            if (response.content?.['application/json']?.schema) {
              responseValidators[statusCode] = ajv.compile({
                $ref: `root#/paths/${pathPointer}/${method}/responses/${statusCode}/content/application~1json/schema`
              });
            }
          }
        }

        routeValidators.push({
          pattern,
          method: method.toUpperCase(),
          requestValidator,
          responseValidators,
        });
      }
    }
  }
}
await loadRouteValidators(SCHEMA_URL);

function getValidators(method, upstreamPath) {
  const normalizedMethod = method.toUpperCase();
  for (const rv of routeValidators) {
    if (rv.method === normalizedMethod && rv.pattern.test(upstreamPath)) {
      return rv;
    }
  }
  return null;
}

function normalizePrefix(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return '/api/cdisc';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function normalizeHeaderName(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return value.trim().toLowerCase();
}

function normalizeHeaderValue(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function validateTrustedIngressConfig() {
  if (Boolean(TRUSTED_INGRESS_HEADER_NAME) !== Boolean(TRUSTED_INGRESS_HEADER_VALUE)) {
    throw new Error(
      'CDISC_TRUSTED_INGRESS_HEADER_NAME and CDISC_TRUSTED_INGRESS_HEADER_VALUE must be configured together.',
    );
  }
}

function buildUpstreamUrl(upstreamPath, searchParams) {
  const upstreamUrl = new URL(UPSTREAM_BASE_URL);
  const basePath = upstreamUrl.pathname.replace(/\/+$/, '');
  const relativePath = upstreamPath.replace(/^\/+/, '');
  const joinedPath = [basePath, relativePath].filter(Boolean).join('/');
  upstreamUrl.pathname = joinedPath.startsWith('/') ? joinedPath : `/${joinedPath}`;
  upstreamUrl.search = searchParams.toString();
  return upstreamUrl;
}

function getKeyChain() {
  const entries = [
    ['primary', config.CDISC_PRIMARY_KEY],
    ['secondary', config.CDISC_SECONDARY_KEY],
  ];

  return entries
    .map(([slot, value]) => ({
      slot,
      value: typeof value === 'string' ? value.trim() : '',
    }))
    .filter((entry, index, collection) =>
      entry.value.length > 0 &&
      collection.findIndex((candidate) => candidate.value === entry.value) === index,
    );
}

function getProxyHealthPayload() {
  const keys = getKeyChain();
  return {
    ok: keys.length > 0,
    code: keys.length > 0 ? 'PROXY_READY' : 'PROXY_MISSING_API_KEY',
    message:
      keys.length > 0
        ? 'CDISC proxy is configured.'
        : 'CDISC proxy is missing both CDISC_PRIMARY_KEY and CDISC_SECONDARY_KEY.',
    proxyPrefix: PROXY_PREFIX,
    upstreamBaseUrl: UPSTREAM_BASE_URL.toString().replace(/\/+$/, ''),
    keySlots: keys.map((entry) => entry.slot),
    allowedOriginCount: allowUntrustedOrigins ? 'unrestricted' : configuredOrigins.size,
  };
}

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function resolveRequestOrigin(headers) {
  const candidates = [headers.origin, headers.referer];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    try {
      return new URL(candidate).origin;
    } catch {
      // Ignore malformed origin-like values.
    }
  }

  return null;
}

function hasTrustedIngressAssertion(request) {
  if (!TRUSTED_INGRESS_HEADER_NAME || !TRUSTED_INGRESS_HEADER_VALUE) {
    return false;
  }

  const headerValue = request.headers[TRUSTED_INGRESS_HEADER_NAME];
  if (Array.isArray(headerValue)) {
    return headerValue.includes(TRUSTED_INGRESS_HEADER_VALUE);
  }

  return headerValue === TRUSTED_INGRESS_HEADER_VALUE;
}

/**
 * Validates if the incoming request originates from a trusted source.
 * This ensures that only local traffic or traffic that has passed through 
 * an authorized reverse proxy (and contains the correct ingress header) is processed.
 * 
 * @param {import('node:http').IncomingMessage} request The incoming HTTP request.
 * @returns {boolean} True if the request is trusted, false otherwise.
 */
function isTrustedRequest(request) {
  return isLoopbackAddress(request.socket.remoteAddress) || hasTrustedIngressAssertion(request);
}

function setCorsHeaders(response, requestOrigin) {
  if (allowUntrustedOrigins && requestOrigin) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else if (requestOrigin && configuredOrigins.has(requestOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', PROXY_ALLOWED_HEADERS.join(', '));
  response.setHeader('Access-Control-Expose-Headers', PROXY_ALLOWED_RESPONSE_HEADERS.join(', '));
  response.setHeader('Access-Control-Max-Age', '600');
  response.setHeader('Vary', 'Origin');
}

function sendJson(response, status, payload, requestOrigin) {
  setCorsHeaders(response, requestOrigin);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function stripHopByHopHeaders(headers) {
  const stripped = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (!NORMALIZED_PROXY_ALLOWED_HEADERS.includes(name.toLowerCase())) {
      continue;
    }

    if (Array.isArray(value)) {
      stripped.set(name, value.join(', '));
    } else if (typeof value === 'string') {
      stripped.set(name, value);
    }
  }

  return stripped;
}

function isOperationAllowed(method, pathname) {
  return libIsOperationAllowed(allowedOperations, method, pathname);
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function getForwardPath(url) {
  if (!url.pathname.startsWith(PROXY_PREFIX)) {
    return null;
  }

  const withoutPrefix = url.pathname.slice(PROXY_PREFIX.length) || '/';
  return withoutPrefix.startsWith('/') ? withoutPrefix : `/${withoutPrefix}`;
}

/**
 * Proxies the incoming request to the upstream CDISC API.
 * This function enforces path restrictions, strips hop-by-hop headers,
 * and implements a fallback retry mechanism using primary and secondary API keys.
 * If the primary key fails with a 401 or 403, it will automatically retry with the secondary key.
 * 
 * @param {import('node:http').IncomingMessage} request The incoming HTTP request.
 * @param {import('node:http').ServerResponse} response The HTTP response object.
 * @param {URL} url The parsed request URL.
 * @param {string|null} requestOrigin The resolved request origin for CORS processing.
 * @returns {Promise<void>}
 */
async function proxyToUpstream(request, response, url, requestOrigin) {
  const upstreamPath = getForwardPath(url);
  if (!upstreamPath) {
    sendJson(response, 404, {
      ok: false,
      code: 'PROXY_PATH_NOT_FOUND',
      message: `Expected requests under ${PROXY_PREFIX}.`,
    }, requestOrigin);
    return;
  }

  if (!isOperationAllowed(request.method ?? 'GET', upstreamPath)) {
    sendJson(response, 404, {
      ok: false,
      code: 'PROXY_PATH_NOT_ALLOWED',
      message: 'Requested path is not part of the documented CDISC API surface.',
    }, requestOrigin);
    return;
  }

  if (upstreamPath === '/__duckdeploy/health') {
    const health = getProxyHealthPayload();
    sendJson(response, health.ok ? 200 : 503, health, requestOrigin);
    return;
  }

  const keys = getKeyChain();
  if (keys.length === 0) {
    sendJson(response, 503, getProxyHealthPayload(), requestOrigin);
    return;
  }

  const body =
    request.method && ['GET', 'HEAD'].includes(request.method.toUpperCase())
      ? undefined
      : await readRequestBody(request);

  const validators = getValidators(request.method ?? 'GET', upstreamPath);
  if (body && body.length > 0 && request.headers['content-type']?.includes('application/json')) {
    if (validators?.requestValidator) {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body.toString('utf8'));
      } catch (e) {
        sendJson(response, 400, {
          ok: false,
          code: 'PROXY_INVALID_JSON',
          message: 'Request body must be valid JSON.',
        }, requestOrigin);
        return;
      }
      
      const valid = validators.requestValidator(parsedBody);
      if (!valid) {
        sendJson(response, 400, {
          ok: false,
          code: 'PROXY_REQUEST_VALIDATION_FAILED',
          message: 'Request body schema validation failed.',
          errors: validators.requestValidator.errors
        }, requestOrigin);
        return;
      }
    }
  }

  const queryParams = new URLSearchParams(url.searchParams);
  for (const keyName of ['api-key', 'apikey', 'apiKey', 'API-KEY', 'APIKEY']) {
    queryParams.delete(keyName);
  }

  const upstreamUrl = buildUpstreamUrl(upstreamPath, queryParams);

  const baseHeaders = stripHopByHopHeaders(request.headers);
  let upstreamResponse;

  for (const key of keys) {
    const requestHeaders = new Headers(baseHeaders);
    requestHeaders.set('api-key', key.value);

    upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: requestHeaders,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (upstreamResponse.status !== 401 && upstreamResponse.status !== 403) {
      break;
    }
  }

  const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

  const contentType = upstreamResponse.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    const status = String(upstreamResponse.status);
    const responseValidator = validators?.responseValidators?.[status] || validators?.responseValidators?.['default'];
    if (responseValidator) {
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseBuffer.toString('utf8'));
        const valid = responseValidator(parsedResponse);
        if (!valid) {
          console.error(`Response schema validation failed for ${request.method} ${upstreamPath} - Status ${status}`);
          sendJson(response, 502, {
            ok: false,
            code: 'PROXY_RESPONSE_VALIDATION_FAILED',
            message: 'Upstream response schema validation failed.',
            errors: responseValidator.errors
          }, requestOrigin);
          return;
        }
      } catch (e) {
        console.error(`Failed to parse JSON response for validation:`, e);
      }
    }
  }

  setCorsHeaders(response, requestOrigin);
  response.statusCode = upstreamResponse.status;

  for (const [name, value] of upstreamResponse.headers.entries()) {
    if (PROXY_ALLOWED_RESPONSE_HEADERS.includes(name.toLowerCase())) {
      response.setHeader(name, value);
    }
  }

  response.setHeader('Cache-Control', 'no-store');
  response.end(responseBuffer);
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const requestOrigin = resolveRequestOrigin(request.headers);

  if (!isTrustedRequest(request)) {
    sendJson(response, 403, {
      ok: false,
      code: 'PROXY_REQUEST_FORBIDDEN',
      message:
        'This proxy only serves loopback traffic unless a trusted ingress header is configured and injected by the reverse proxy.',
    }, requestOrigin);
    return;
  }

  if (request.method === 'OPTIONS') {
    setCorsHeaders(response, requestOrigin);
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    await proxyToUpstream(request, response, requestUrl, requestOrigin);
  } catch (error) {
    console.error('CDISC proxy request failed:', error);
    sendJson(response, 502, {
      ok: false,
      code: 'PROXY_REQUEST_FAILED',
      message: 'The proxy could not complete the upstream request.',
    }, requestOrigin);
  }
});

validateTrustedIngressConfig();

server.listen(PORT, () => {
  console.log(`DuckDeploy CDISC proxy listening on http://localhost:${PORT}${PROXY_PREFIX}`);
});
