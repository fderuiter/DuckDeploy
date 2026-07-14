import { HTTP_METHODS } from '../../../src/core/discovery.ts';

/**
 * Resolve a JSON Reference ($ref) to the schema node it points to within the
 * given spec object. Returns null when the ref is invalid or unresolvable.
 */
export const resolveRef = (spec: any, ref: string): any => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = spec;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = current[part];
  }
  return current;
};

export interface ConstraintField {
  pointer: string;
  constraintType: 'enum' | 'minLength' | 'pattern';
}

/**
 * Recursively collect all schema properties that bear constraints we want to
 * validate (enum, minLength, pattern), returning an array of { pointer, constraintType } descriptors.
 *
 * $ref nodes are resolved inline so that constraints defined in shared
 * component schemas are correctly discovered even in $ref-heavy specs.
 */
export const collectConstraintBearingFields = (spec: any): ConstraintField[] => {
  const results: ConstraintField[] = [];
  const escapeSegment = (s: string) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');

  const walk = (schema: any, pointer: string, visitedRefs = new Set<string>()) => {
    if (!schema || typeof schema !== 'object') return;

    if (typeof schema.$ref === 'string') {
      if (visitedRefs.has(schema.$ref)) return;
      const resolved = resolveRef(spec, schema.$ref);
      if (!resolved) return;
      visitedRefs.add(schema.$ref);
      walk(resolved, pointer, visitedRefs);
      visitedRefs.delete(schema.$ref);
      return;
    }

    if (Array.isArray(schema.allOf)) {
      for (let i = 0; i < schema.allOf.length; i++) {
        walk(schema.allOf[i], pointer, visitedRefs);
      }
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      results.push({ pointer, constraintType: 'enum' });
    }
    if (typeof schema.minLength === 'number') {
      results.push({ pointer, constraintType: 'minLength' });
    }
    if (typeof schema.pattern === 'string') {
      results.push({ pointer, constraintType: 'pattern' });
    }

    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        walk(propSchema, `${pointer}/properties/${escapeSegment(propName)}`, visitedRefs);
      }
    }
    if (schema.items && typeof schema.items === 'object') {
      walk(schema.items, `${pointer}/items`, visitedRefs);
    }
    if (Array.isArray(schema.oneOf)) {
      schema.oneOf.forEach((s: any, i: number) => walk(s, `${pointer}/oneOf/${i}`, visitedRefs));
    }
    if (Array.isArray(schema.anyOf)) {
      schema.anyOf.forEach((s: any, i: number) => walk(s, `${pointer}/anyOf/${i}`, visitedRefs));
    }
  };

  if (!spec.paths || typeof spec.paths !== 'object') return results;

  for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const escapedPath = escapeSegment(apiPath);

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!operation || typeof operation !== 'object') continue;

      const rbContent = (operation as any).requestBody?.content;
      if (rbContent && typeof rbContent === 'object') {
        for (const [mediaType, mediaObj] of Object.entries(rbContent)) {
          if ((mediaObj as any)?.schema) {
            walk(
              (mediaObj as any).schema,
              `#/paths/${escapedPath}/${method}/requestBody/content/${escapeSegment(mediaType)}/schema`,
            );
          }
        }
      }

      if ((operation as any).responses && typeof (operation as any).responses === 'object') {
        for (const [status, response] of Object.entries((operation as any).responses)) {
          if (!(response as any)?.content || typeof (response as any).content !== 'object') continue;
          for (const [mediaType, mediaObj] of Object.entries((response as any).content)) {
            if ((mediaObj as any)?.schema) {
              walk(
                (mediaObj as any).schema,
                `#/paths/${escapedPath}/${method}/responses/${status}/content/${escapeSegment(mediaType)}/schema`,
              );
            }
          }
        }
      }
    }
  }

  return results;
};
