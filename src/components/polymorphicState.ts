import type { UseFormReturn } from 'react-hook-form';

type Unregister = UseFormReturn['unregister'];
type SetValue = UseFormReturn['setValue'];

export const resetPolymorphicValue = (
  unregister: Unregister,
  setValue: SetValue,
  source: string,
  discriminatorProperty?: string,
  discriminatorValue?: string,
) => {
  unregister(source);
  const nextValue =
    discriminatorProperty && discriminatorValue !== undefined ? { [discriminatorProperty]: discriminatorValue } : undefined;
  setValue(source, nextValue, {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  });
};
