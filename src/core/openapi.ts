export const resolveRef = (spec: any, ref: string): any | null => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = spec;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = current[part];
  }
  return current;
};

export const resolveResourceName = (apiPath: string, pathItem: any, methods: string[]): string | null => {
  for (const method of methods) {
    if (pathItem[method]?.tags?.length > 0) {
      return pathItem[method].tags[0];
    }
  }

  const segments = apiPath.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  return segments[0];
};
