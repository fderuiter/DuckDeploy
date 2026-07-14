export const SCHEMA_SELECTION_KEY = '__duckdeploy_schema_selection';

// Service Paths & Endpoints
export const DEFAULT_LOCAL_PROXY_BASE_URL = '/api/cdisc';
export const HEALTH_PATH_SUFFIX = '/__duckdeploy/health';

// Error Codes
export const PROXY_MISSING_API_KEY = 'PROXY_MISSING_API_KEY';
export const PROXY_READY = 'PROXY_READY';
export const PROXY_PATH_NOT_FOUND = 'PROXY_PATH_NOT_FOUND';
export const PROXY_PATH_NOT_ALLOWED = 'PROXY_PATH_NOT_ALLOWED';
export const PROXY_INVALID_JSON = 'PROXY_INVALID_JSON';
export const PROXY_REQUEST_VALIDATION_FAILED = 'PROXY_REQUEST_VALIDATION_FAILED';
export const PROXY_RESPONSE_VALIDATION_FAILED = 'PROXY_RESPONSE_VALIDATION_FAILED';
export const PROXY_REQUEST_FORBIDDEN = 'PROXY_REQUEST_FORBIDDEN';
export const PROXY_REQUEST_FAILED = 'PROXY_REQUEST_FAILED';
export const ERR_HEALTH = 'ERR_HEALTH';

// Headers & Protocol Identifiers
export const CDISC_API_KEY_HEADER = 'api-key';
export const AUTHENTICATE_HEADER = 'www-authenticate';
export const API_KEY_QUERY_PARAMS = ['api-key', 'apikey', 'apiKey', 'API-KEY', 'APIKEY'] as const;
export const PROXY_ALLOWED_HEADERS = [
  'Accept', 'Accept-Language', 'Content-Type', 'If-Match', 'If-None-Match', 'Prefer', 'Range'
] as const;
export const BASE_PROXY_ALLOWED_RESPONSE_HEADERS = [
  'content-type', 'content-disposition', 'etag', 'last-modified', 'cache-control', 'content-range', 'x-total-count', AUTHENTICATE_HEADER
] as const;

// Filenames
export const SCHEMA_FILENAME = 'schema.json';
export const UI_MANIFEST_FILENAME = 'ui-manifest.json';
