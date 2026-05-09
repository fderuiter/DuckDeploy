import type { UseFormReturn } from 'react-hook-form';

type Unregister = UseFormReturn['unregister'];
type SetValue = UseFormReturn['setValue'];

export const areShallowObjectsEqual = (left: Record<string, unknown>, right: Record<string, unknown>) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
};

export const cleanupPolymorphicObjectValue = (
  value: Record<string, unknown>,
  allowedKeys: Set<string> | null,
  discriminatorProperty?: string,
  discriminatorValue?: string,
) => {
  const cleanedValue = Object.entries(value).reduce<Record<string, unknown>>((acc, [key, fieldValue]) => {
    if (key.endsWith('__schemaIndex')) return acc;
    if (allowedKeys && !allowedKeys.has(key)) return acc;
    acc[key] = fieldValue;
    return acc;
  }, {});

  if (discriminatorProperty && discriminatorProperty.trim().length > 0 && discriminatorValue !== undefined && discriminatorValue !== '') {
    cleanedValue[discriminatorProperty] = discriminatorValue;
  }

  return cleanedValue;
};

export const resetPolymorphicValue = (
  unregister: Unregister,
  setValue: SetValue,
  source: string,
  discriminatorProperty?: string,
  discriminatorValue?: string,
) => {
  unregister(source);
  const nextValue =
    discriminatorProperty && discriminatorProperty.trim().length > 0 && discriminatorValue !== undefined && discriminatorValue !== ''
      ? { [discriminatorProperty]: discriminatorValue }
      : undefined;
  setValue(source, nextValue, {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  });
};

export const setPolymorphicDiscriminatorValue = (
  setValue: SetValue,
  source: string,
  discriminatorProperty?: string,
  discriminatorValue?: string,
) => {
  if (
    !discriminatorProperty ||
    discriminatorProperty.trim().length === 0 ||
    discriminatorValue === undefined ||
    discriminatorValue === ''
  ) {
    return;
  }

  setValue(
    source,
    { [discriminatorProperty]: discriminatorValue },
    {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    },
  );
};
