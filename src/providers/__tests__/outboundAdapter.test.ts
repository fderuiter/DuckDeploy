import { describe, it, expect } from 'vitest';
import { adaptOutboundPayload } from '../outboundAdapter';
import type { OpenAPIV3 } from 'openapi-types';

describe('outboundAdapter', () => {
  it('correctly includes fields defined in allOf schema segments', () => {
    const schema: OpenAPIV3.SchemaObject = {
      allOf: [
        {
          type: 'object',
          properties: {
            baseField: { type: 'string' },
          },
        },
        {
          type: 'object',
          properties: {
            extendedField: { type: 'string' },
          },
        },
      ],
    };

    const payload = {
      baseField: 'value1',
      extendedField: 'value2',
      unknownField: 'value3',
    };

    const adapted = adaptOutboundPayload(payload, schema);
    expect(adapted).toEqual({
      baseField: 'value1',
      extendedField: 'value2',
      unknownField: 'value3', // unmapped fields are kept if not stripped
    });
  });

  it('coerces form submissions containing oneOf or anyOf fields using metadata from the selected branch', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        polymorphicField: {
          oneOf: [
            {
              type: 'object',
              properties: {
                flag: { type: 'boolean' },
              },
            },
            {
              type: 'object',
              properties: {
                flagStr: { type: 'string' },
              },
            },
          ],
        },
      },
    };

    const payload = {
      polymorphicField: {
        flag: 'true',
      },
      polymorphicField__schemaIndex: 0,
    };

    const adapted = adaptOutboundPayload(payload, schema);
    expect(adapted).toEqual({
      polymorphicField: {
        flag: true, // properly coerced because it knows it's index 0 where flag is boolean
      },
    });
    // Ensure metadata index is stripped
    expect(adapted).not.toHaveProperty('polymorphicField__schemaIndex');
  });

  it('strips empty strings as null', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {
        myField: { type: 'string' },
      },
    };

    const payload = {
      myField: '',
    };

    expect(adaptOutboundPayload(payload, schema)).toEqual({
      myField: null,
    });
  });
});
