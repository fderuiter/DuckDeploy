export const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

export const joinRelativeUrl = (baseUrl: string, suffix: string): string =>
  `${trimTrailingSlashes(baseUrl)}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;

export const normalizePrefix = (value: string | undefined | null, fallback = '/api/cdisc'): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return fallback;
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return trimTrailingSlashes(withLeadingSlash);
};

export const pathToRegExp = (pathTemplate: string): RegExp => {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\{[^/}]+\\\}/g, '[^/]+')}$`);
};

export const buildProbeUrl = (path: string, tokenGenerator: (param: string) => string): string =>
  path.replace(/\{([^/}]+)\}/g, (_match, pathParam) => tokenGenerator(pathParam));

export const buildUpstreamUrl = (upstreamBaseUrl: string | URL, upstreamPath: string, searchParams: URLSearchParams): URL => {
  const upstreamUrl = new URL(upstreamBaseUrl.toString());
  const basePath = upstreamUrl.pathname.replace(/\/+$/, '');
  const relativePath = upstreamPath.replace(/^\/+/, '');
  const joinedPath = [basePath, relativePath].filter(Boolean).join('/');
  upstreamUrl.pathname = joinedPath.startsWith('/') ? joinedPath : `/${joinedPath}`;
  upstreamUrl.search = searchParams.toString();
  return upstreamUrl;
};
