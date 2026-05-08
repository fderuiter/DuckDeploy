import type { UseFormReturn } from 'react-hook-form';

type Unregister = UseFormReturn['unregister'];
type SetValue = UseFormReturn['setValue'];

export const resetPolymorphicValue = (unregister: Unregister, setValue: SetValue, source: string) => {
  unregister(source);
  setValue(source, undefined, {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  });
};
