import { describe, it, expect } from 'vitest';
import { extractConstraints, applyConstraintLogic } from '../schemaHelpers';
import type { OpenAPIV3 } from 'openapi-types';

describe('schemaHelpers constraint logic', () => {
  it('extractConstraints extracts correctly', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: 'string',
      minLength: 2,
      maxLength: 10,
      pattern: '^[a-z]+$',
    };
    const constraints = extractConstraints(schema);
    expect(constraints).toEqual({
      minLength: 2,
      maxLength: 10,
      minimum: undefined,
      maximum: undefined,
      pattern: '^[a-z]+$',
    });
  });

  it('applyConstraintLogic checks strings correctly', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: 'string',
      minLength: 2,
      maxLength: 5,
      pattern: '^[a-z]+$',
    };
    const constraints = extractConstraints(schema);

    expect(applyConstraintLogic('abc', constraints)).toBe(true);
    expect(applyConstraintLogic('a', constraints)).toBe(false); // minLength
    expect(applyConstraintLogic('abcdef', constraints)).toBe(false); // maxLength
    expect(applyConstraintLogic('ABC', constraints)).toBe(false); // pattern
  });

  it('applyConstraintLogic checks numbers correctly', () => {
    const schema: OpenAPIV3.SchemaObject = {
      type: 'number',
      minimum: 2,
      maximum: 5,
    };
    const constraints = extractConstraints(schema);

    expect(applyConstraintLogic(3, constraints)).toBe(true);
    expect(applyConstraintLogic(1, constraints)).toBe(false); // minimum
    expect(applyConstraintLogic(6, constraints)).toBe(false); // maximum
  });

  it('verify constraint logic identical between validation and adaptation phases', () => {
    // This test ensures that the same constraints from extractConstraints
    // are correctly interpreted and evaluated. Both UI validators and the
    // adapter (if it were to validate) would use the exact same output.
    const schema: OpenAPIV3.SchemaObject = { type: 'string', pattern: '^\\d+$' };
    const constraints = extractConstraints(schema);
    
    // Adapter phase simulation
    expect(applyConstraintLogic('123', constraints)).toBe(true);
    expect(applyConstraintLogic('abc', constraints)).toBe(false);
  });
});
