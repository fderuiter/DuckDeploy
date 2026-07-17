import { createContext, useContext } from 'react';

/**
 * Defines the contract for form layout orchestration context.
 */
export interface FormLayoutContextValue {
  /** Given a field source, attempts to reveal that field (e.g. by expanding an accordion or switching a tab). */
  revealField: (fieldSource: string) => Promise<void>;
}

/**
 * Context that provides access to the layout orchestrator logic for dynamic forms.
 */
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
