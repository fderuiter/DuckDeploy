import { FULL_HTTP_METHODS } from '@duckdeploy/types';

interface AllowedOperation {
  pattern: RegExp;
  methods: Set<string>;
}

/**
 * Generated description.
 *
 */
export const pathToRegExp = (pathTemplate: string): RegExp => {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\\\{[^/}]+\\\}/g, '[^/]+')}$`);
};

/**
 * Generated description.
 *
 */
export const parseAllowedOperations = (parsedSpec: any): AllowedOperation[] => {
  const paths = parsedSpec && typeof parsedSpec === 'object' ? parsedSpec.paths : undefined;
  if (!paths || typeof paths !== 'object') {
    throw new Error('Unable to load OpenAPI paths for proxy allow-listing.');
  }

  return Object.entries(paths).map(([path, pathItem]: [string, any]) => {
    const methods = new Set(
      Object.keys(pathItem)
        .filter((method) =>
          FULL_HTTP_METHODS.has(method.toLowerCase())
        )
        .map((method) => method.toUpperCase())
    );

    return {
      pattern: pathToRegExp(path),
      methods,
    };
  });
};

/**
 * Generated description.
 *
 */
export const isOperationAllowed = (allowedOperations: AllowedOperation[], method: string, pathname: string): boolean => {
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
};
