import { required, minLength, maxLength, minValue, maxValue, regex } from 'react-admin';
import type { OpenAPIV3 } from 'openapi-types';
import { extractConstraints } from '../utils/schemaHelpers';

export const buildValidators = (property: OpenAPIV3.SchemaObject, isRequired: boolean): any[] => {
  const validators: any[] = [];
  const constraints = extractConstraints(property);

  if (isRequired) validators.push(required());
  if (constraints.minLength !== undefined) validators.push(minLength(constraints.minLength));
  if (constraints.maxLength !== undefined) validators.push(maxLength(constraints.maxLength));
  if (constraints.minimum !== undefined) validators.push(minValue(constraints.minimum));
  if (constraints.maximum !== undefined) validators.push(maxValue(constraints.maximum));
  if (constraints.pattern) validators.push(regex(new RegExp(constraints.pattern), `Format must match: ${constraints.pattern}`));

  return validators;
};
