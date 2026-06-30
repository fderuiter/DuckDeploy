import type { OpenAPIV3 } from 'openapi-types';
import { SCHEMA_SELECTION_KEY } from './constants.ts';

export const isSchemaObject = (
  obj: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined
): obj is OpenAPIV3.SchemaObject =>
  typeof obj === 'object' && obj !== null && !('$ref' in obj);

const BOOLEAN_TRUE_STRINGS = new Set(['true', '1', 'y', 'yes']);
const BOOLEAN_FALSE_STRINGS = new Set(['false', '0', 'n', 'no']);

export const coerceBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (BOOLEAN_TRUE_STRINGS.has(lower)) return true;
    if (BOOLEAN_FALSE_STRINGS.has(lower)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return null;
};

export const coerceNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }
  return null;
};

export interface TraversalContext {
  schema?: OpenAPIV3.SchemaObject;
  pointer: string;
  source: string;
  isRequired: boolean;
  payload?: any;
  parentPayload?: any;
  key?: string;
}

export interface Visitor {
  visitNode: (context: TraversalContext, defaultVisit: () => any) => any;
}

export const escapeJsonPointer = (segment: string) =>
  String(segment).replace(/~/g, '~0').replace(/\//g, '~1');

export class UnifiedSchemaWalker {
  private visited = new Set<any>();

  private visitor: Visitor;
  private options: { walkPayload?: boolean };

  constructor(visitor: Visitor, options: { walkPayload?: boolean } = {}) {
    this.visitor = visitor;
    this.options = options;
  }

  public walk(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
    payload?: any,
    source: string = '',
    pointer: string = '#',
    isRequired: boolean = false
  ): any {
    return this._walk(schema, {
      pointer,
      source,
      isRequired,
      payload,
    });
  }

  private _walk(
    rawSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
    context: Omit<TraversalContext, 'schema'>
  ): any {
    let schema: OpenAPIV3.SchemaObject | undefined = undefined;

    if (isSchemaObject(rawSchema)) {
      schema = rawSchema;
      if (this.visited.has(schema)) {
        return this.options.walkPayload ? context.payload : null;
      }
      this.visited.add(schema);
    } else if (!this.options.walkPayload) {
      return null;
    }

    const fullContext: TraversalContext = { ...context, schema };

    const result = this.visitor.visitNode(fullContext, () => this.defaultVisit(fullContext));

    if (schema) {
      this.visited.delete(schema);
    }
    return result;
  }

  private defaultVisit(context: TraversalContext): any {
    const { schema, payload, source, pointer } = context;

    if (this.options.walkPayload) {
      if (payload === undefined || payload === null) {
        return null;
      }

      if (schema && (schema.oneOf || schema.anyOf)) {
        let indexVal: any;
        if (context.parentPayload && context.key) {
          indexVal = context.parentPayload[`${context.key}${SCHEMA_SELECTION_KEY}`];
        }
        if (indexVal === undefined && payload && typeof payload === 'object') {
          indexVal = payload[SCHEMA_SELECTION_KEY];
        }

        if (indexVal !== undefined && indexVal !== null) {
          const idx = Number(indexVal);
          const variants = schema.oneOf || schema.anyOf;
          if (variants && variants[idx]) {
            const variantSchema = variants[idx];
            if (schema) this.visited.delete(schema);
            const variantResult = this._walk(variantSchema, context);
            if (schema) this.visited.add(schema);
            return variantResult;
          }
        }
      }

      if (payload === '') {
        return null;
      }

      if (schema?.type === 'boolean') {
        return coerceBoolean(payload);
      }
      
      if (schema?.type === 'number' || schema?.type === 'integer') {
        return coerceNumber(payload);
      }

      if ((schema?.type === 'object' || schema?.properties) || typeof payload === 'object') {
        if (typeof payload === 'object' && !Array.isArray(payload)) {
          const result: any = {};
          for (const [k, v] of Object.entries(payload)) {
            if (k.endsWith(SCHEMA_SELECTION_KEY)) continue;
            if (v === undefined) continue;

            const childSchema = schema?.properties?.[k];
            const isReq = schema ? (schema.required || []).includes(k) : false;
            const nestedSource = source ? `${source}.${k}` : k;
            
            result[k] = this._walk(childSchema, {
              pointer: `${pointer}/properties/${escapeJsonPointer(k)}`,
              source: nestedSource,
              isRequired: isReq,
              payload: v,
              parentPayload: payload,
              key: k,
            });
          }
          return result;
        }
      }

      if ((schema?.type === 'array' || schema?.items) || Array.isArray(payload)) {
         if (Array.isArray(payload)) {
            return payload.map((item, idx) => 
               this._walk(schema?.items, {
                 pointer: `${pointer}/items`,
                 source: source ? `${source}.${idx}` : `${idx}`,
                 isRequired: false,
                 payload: item,
                 parentPayload: payload,
                 key: String(idx)
               })
            );
         }
      }

      return payload;
    } else {
      if (!schema) return null;

      if (schema.type === 'object' || schema.properties) {
        const children = Object.entries(schema.properties || {}).map(([subName, subSchema]) => {
          const nestedSource = source ? `${source}.${subName}` : subName;
          const childRequired = (schema.required || []).includes(subName);
          const childPointer = `${pointer}/properties/${escapeJsonPointer(subName)}`;
          return this._walk(subSchema, {
            pointer: childPointer,
            source: nestedSource,
            isRequired: childRequired,
          });
        }).filter(Boolean);
        return { kind: 'object', children };
      }

      if (schema.type === 'array' || schema.items) {
        const itemNode = this._walk(schema.items, {
          pointer: `${pointer}/items`,
          source: '',
          isRequired: false,
        });
        return { kind: 'array', items: itemNode ? [itemNode] : [] };
      }

      if (schema.oneOf || schema.anyOf) {
        const variants = schema.oneOf || schema.anyOf;
        const options = variants!.map((variant, index) => {
          const variantPointer = `${pointer}/${schema.oneOf ? 'oneOf' : 'anyOf'}/${index}`;
          return this._walk(variant, {
            pointer: variantPointer,
            source,
            isRequired: context.isRequired
          });
        }).filter(Boolean);
        return { kind: 'polymorphic', options };
      }

      return { kind: schema.type || 'text' };
    }
  }
}
