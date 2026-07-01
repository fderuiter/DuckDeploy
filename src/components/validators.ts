import { required, minLength, maxLength, minValue, maxValue, regex } from 'react-admin';
import type { OpenAPIV3 } from 'openapi-types';

/**
 * Generated description.
 *
 */
export const buildValidators = (property: OpenAPIV3.SchemaObject, isRequired: boolean): any[] => {
  const validators: any[] = [];

  if (isRequired) validators.push(required());
  if (property.minLength !== undefined) validators.push(minLength(property.minLength));
  if (property.maxLength !== undefined) validators.push(maxLength(property.maxLength));
  if (property.minimum !== undefined) validators.push(minValue(property.minimum));
  if (property.maximum !== undefined) validators.push(maxValue(property.maximum));
  if (property.pattern) validators.push(regex(new RegExp(property.pattern), `Format must match: ${property.pattern}`));

  return validators;
};
