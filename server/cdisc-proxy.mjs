import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import yaml from 'js-yaml';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const UPSTREAM_BASE_URL = new URL(process.env.CDISC_UPSTREAM_BASE_URL ?? 'https://api.library.cdisc.org');
const PROXY_PREFIX = normalizePrefix(process.env.CDISC_PROXY_PREFIX ?? '/api/cdisc');
const HEALTH_PATH = `${PROXY_PREFIX}/__duckdeploy/health`;
const MAX_REQUEST_BODY_BYTES = Number.parseInt(process.env.CDISC_PROXY_MAX_BODY_BYTES ?? '1048576', 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.CDISC_PROXY_TIMEOUT_MS ?? '15000', 10);
const configuredOrigins = parseAllowedOrigins(process.env.CDISC_ALLOWED_ORIGINS);
const allowUntrustedOrigins = process.env.CDISC_ALLOW_UNTRUSTED_ORIGINS === 'true';

const OPENAPI_SPEC_URL = new URL('../openapi.yaml', import.meta.url);
const allowedOperations = await loadAllowedOperations(OPENAPI_SPEC_URL);

function normalizePrefix(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return '/api/cdisc';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function parseAllowedOrigins(rawValue) {
  const fallbackOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const values = typeof rawValue === 'string' && rawValue.trim().length > 0
    ? rawValue.split(',').map((entry) => entry.trim()).filter(Boolean)
    : fallbackOrigins;
  return new Set(values);
}

async function loadAllowedOperations(specUrl) {
  const source = await readFile(specUrl, 'utf8');
  const parsed = yaml.load(source);
  const paths = parsed && typeof parsed === 'object' ? parsed.paths : undefined;
  if (!paths || typeof paths !== 'object') {
    throw new Error('Unable to load OpenAPI paths for proxy allow-listing.');
  }

  return Object.entries(paths).map(([path, pathItem]) => {
    const methods = new Set(
      Object.keys(pathItem).filter((method) =>
        ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase()),
      ).map((method) => method.toUpperCase()),
    );

    return {
      pattern: pathToRegExp(path),
      methods,
    };
  });
}

function pathToRegExp(pathTemplate) {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\{[^/}]+\\\}/g, '[^/]+')}$`);
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

function isTrustedOrigin(request) {
  if (allowUntrustedOrigins) {
    return true;
  }

  const resolvedOrigin = resolveRequestOrigin(request.headers);
  if (resolvedOrigin) {
    return configuredOrigins.has(resolvedOrigin);
  }

  return isLoopbackAddress(request.socket.remoteAddress);
}

function setCorsHeaders(response, requestOrigin) {
  if (allowUntrustedOrigins && requestOrigin) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else if (requestOrigin && configuredOrigins.has(requestOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Accept-Language, Content-Type, If-Match, If-None-Match, Prefer, Range');
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
  const allowedHeaders = ['accept', 'accept-language', 'content-type', 'if-match', 'if-none-match', 'prefer', 'range'];
  const stripped = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (!allowedHeaders.includes(name.toLowerCase())) {
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
  const normalizedMethod = method.toUpperCase();
  return allowedOperations.some(({ pattern, methods }) => {
    if (!pattern.test(pathname)) {
      return false;
    }

    if (methods.has(normalizedMethod)) {
      return true;
    }

    return normalizedMethod === 'HEAD' && methods.has('GET');
  });
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
  queryParams.delete('api-key');

  const upstreamUrl = new URL(upstreamPath, UPSTREAM_BASE_URL);
  upstreamUrl.search = queryParams.toString();

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

  if (!upstreamResponse) {
    sendJson(response, 502, {
      ok: false,
      code: 'PROXY_UPSTREAM_UNAVAILABLE',
      message: 'CDISC proxy could not reach the upstream API.',
    }, requestOrigin);
    return;
  }

  setCorsHeaders(response, requestOrigin);
  response.statusCode = upstreamResponse.status;

  for (const [name, value] of upstreamResponse.headers.entries()) {
    if (['content-type', 'content-disposition', 'etag', 'last-modified', 'cache-control', 'content-range', 'x-total-count'].includes(name.toLowerCase())) {
      response.setHeader(name, value);
    }
  }

  response.setHeader('Cache-Control', 'no-store');
  response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const requestOrigin = resolveRequestOrigin(request.headers);

  if (!isTrustedOrigin(request)) {
    sendJson(response, 403, {
      ok: false,
      code: 'PROXY_ORIGIN_FORBIDDEN',
      message: 'This proxy only serves requests from configured frontend origins.',
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
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 502, {
      ok: false,
      code: 'PROXY_REQUEST_FAILED',
      message,
    }, requestOrigin);
  }
});

server.listen(PORT, () => {
  console.log(`DuckDeploy CDISC proxy listening on http://localhost:${PORT}${PROXY_PREFIX}`);
});
