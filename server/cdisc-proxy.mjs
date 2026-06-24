import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { isOperationAllowed as libIsOperationAllowed } from '@duckdeploy/openapi';

const PORT = parsePort(process.env.PORT);
const PROXY_PREFIX = normalizePrefix(process.env.CDISC_PROXY_PREFIX ?? '/api/cdisc');
const HEALTH_PATH = `${PROXY_PREFIX}/__duckdeploy/health`;
const MAX_REQUEST_BODY_BYTES = Number.parseInt(process.env.CDISC_PROXY_MAX_BODY_BYTES ?? '1048576', 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.CDISC_PROXY_TIMEOUT_MS ?? '15000', 10);
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const PROXY_ALLOWED_HEADERS = ['Accept', 'Accept-Language', 'Content-Type', 'If-Match', 'If-None-Match', 'Prefer', 'Range'];
const NORMALIZED_PROXY_ALLOWED_HEADERS = PROXY_ALLOWED_HEADERS.map((header) => header.toLowerCase());
const PROXY_ALLOWED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'etag', 'last-modified', 'cache-control', 'content-range', 'x-total-count'];
const TRUSTED_INGRESS_HEADER_NAME = normalizeHeaderName(process.env.CDISC_TRUSTED_INGRESS_HEADER_NAME);
const TRUSTED_INGRESS_HEADER_VALUE = normalizeHeaderValue(process.env.CDISC_TRUSTED_INGRESS_HEADER_VALUE);
const configuredOrigins = parseAllowedOrigins(process.env.CDISC_ALLOWED_ORIGINS);
const allowUntrustedOrigins = process.env.CDISC_ALLOW_UNTRUSTED_ORIGINS === 'true';
const UPSTREAM_BASE_URL = parseUpstreamBaseUrl(process.env.CDISC_UPSTREAM_BASE_URL);

const MANIFEST_URL = new URL('../public/ui-manifest.json', import.meta.url);

async function loadAllowedOperations(manifestUrl) {
  const source = await readFile(manifestUrl, 'utf8');
  const parsed = JSON.parse(source);
  return parsed.allowedOperations.map((op) => ({
    pattern: new RegExp(op.pattern),
    methods: new Set(op.methods)
  }));
}

const allowedOperations = await loadAllowedOperations(MANIFEST_URL);

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

function parsePort(rawValue) {
  const normalized = typeof rawValue === 'string' && rawValue.trim().length > 0 ? rawValue.trim() : '8787';
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${normalized}`);
  }

  return parsed;
}

function parseAllowedOrigins(rawValue) {
  const values = typeof rawValue === 'string' && rawValue.trim().length > 0
    ? rawValue.split(',').map((entry) => entry.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return new Set(values);
}

function validateTrustedIngressConfig() {
  if (Boolean(TRUSTED_INGRESS_HEADER_NAME) !== Boolean(TRUSTED_INGRESS_HEADER_VALUE)) {
    throw new Error(
      'CDISC_TRUSTED_INGRESS_HEADER_NAME and CDISC_TRUSTED_INGRESS_HEADER_VALUE must be configured together.',
    );
  }
}

function parseUpstreamBaseUrl(rawValue) {
  try {
    return new URL(rawValue ?? 'https://api.library.cdisc.org');
  } catch (error) {
    const configuredValue = typeof rawValue === 'string' && rawValue.trim().length > 0
      ? rawValue
      : '(default)';
    throw new Error(`Invalid CDISC_UPSTREAM_BASE_URL: ${configuredValue}`, { cause: error });
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
    ['primary', process.env.CDISC_PRIMARY_KEY],
    ['secondary', process.env.CDISC_SECONDARY_KEY],
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

  const keys = getKeyChain();
  if (keys.length === 0) {
    sendJson(response, 503, getProxyHealthPayload(), requestOrigin);
    return;
  }

  const body =
    request.method && ['GET', 'HEAD'].includes(request.method.toUpperCase())
      ? undefined
      : await readRequestBody(request);

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

  setCorsHeaders(response, requestOrigin);
  response.statusCode = upstreamResponse.status;

  for (const [name, value] of upstreamResponse.headers.entries()) {
    if (PROXY_ALLOWED_RESPONSE_HEADERS.includes(name.toLowerCase())) {
      response.setHeader(name, value);
    }
  }

  response.setHeader('Cache-Control', 'no-store');
  response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
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

  if (requestUrl.pathname === HEALTH_PATH) {
    const health = getProxyHealthPayload();
    sendJson(response, health.ok ? 200 : 503, health, requestOrigin);
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
