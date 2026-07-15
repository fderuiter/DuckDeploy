import { createContext, useContext } from 'react';

export interface FormLayoutContextValue {
  revealField: (fieldSource: string) => Promise<void>;
}

export const FormLayoutContext = createContext<FormLayoutContextValue | undefined>(undefined);

/**
 * Access the Form Layout context for revealing elements dynamically.
 */
export const useFormLayout = (): FormLayoutContextValue => {
  const ctx = useContext(FormLayoutContext);
  if (!ctx) {
    return { revealField: () => Promise.resolve() };
  }
  return ctx;
};
