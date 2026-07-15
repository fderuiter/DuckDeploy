import { HTTP_METHODS } from '@duckdeploy/types';
import { escapeJsonPointer, unescapeJsonPointer } from './traversal.ts';

/**
 * Resolve a JSON Reference ($ref) to the schema node it points to within the
 * given spec object. Returns null when the ref is invalid or unresolvable.
 */
export const resolveRef = (spec: any, ref: string): any => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/').map(unescapeJsonPointer);

  const search = (current: any, partIndex: number): any => {
    if (partIndex >= parts.length) return current;
    if (!current || typeof current !== 'object') return null;

    const part = parts[partIndex];
    
    if (part in current) {
      const res = search(current[part], partIndex + 1);
      if (res !== null) return res;
    }
    
    // Fallback for allOf
    if (Array.isArray(current.allOf)) {
      for (const sub of current.allOf) {
        if (sub && typeof sub === 'object') {
           // We try to search inside the sub-schema for this part
           if (part in sub) {
             const res = search(sub[part], partIndex + 1);
             if (res !== null) return res;
           } else if (Array.isArray(sub.allOf)) {
             // Deep allOf (not strictly necessary but safe)
           }
        }
      }
    }
    return null;
  };

  return search(spec, 0);
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
        walk(propSchema, `${pointer}/properties/${escapeJsonPointer(propName)}`, visitedRefs);
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
    const escapedPath = escapeJsonPointer(apiPath);

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!operation || typeof operation !== 'object') continue;

      const rbContent = (operation as any).requestBody?.content;
      if (rbContent && typeof rbContent === 'object') {
        for (const [mediaType, mediaObj] of Object.entries(rbContent)) {
          if ((mediaObj as any)?.schema) {
            walk(
              (mediaObj as any).schema,
              `#/paths/${escapedPath}/${method}/requestBody/content/${escapeJsonPointer(mediaType)}/schema`,
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
                `#/paths/${escapedPath}/${method}/responses/${status}/content/${escapeJsonPointer(mediaType)}/schema`,
              );
            }
          }
        }
      }
    }
  }

  return results;
};
