import { Context, useContext } from 'react';

/**
 * Generated description.
 *
 */
export function useSafeContext<T>(context: Context<T | undefined>, errorMessage: string): T {
  const ctx = useContext(context);
  if (ctx === undefined || ctx === null) {
    throw new Error(errorMessage);
  }
  return ctx;
}
