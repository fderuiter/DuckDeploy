import React from 'react';
import { Box } from '@mui/material';
import { getPrimaryField } from '../utils/heuristics';

export const visuallyHiddenStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(100%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Generated description.
 *
 */
export const VisuallyHidden = ({ children, role, 'aria-live': ariaLive }: { children: React.ReactNode, role?: string, 'aria-live'?: "polite" | "assertive" | "off" }) => (
  <Box
    role={role}
    aria-live={ariaLive}
    sx={visuallyHiddenStyle}
  >
    {children}
  </Box>
);

export type OperationState = 'loading' | 'saving' | 'success' | 'error' | 'idle' | 'empty' | 'loaded';

/**
 * Generated description.
 *
 */
export const getStatusMessage = (state: OperationState, details?: string | number): string => {
  switch (state) {
    case 'loading':
      return 'Loading data';
    case 'saving':
      return 'Saving data';
    case 'success':
      return 'Save complete';
    case 'error':
      return details ? `Save failed: ${details}` : 'Save failed';
    case 'empty':
      return 'Empty list';
    case 'loaded':
      return `Loaded ${details || 0} items`;
    default:
      return '';
  }
};

/**
 * Generated description.
 *
 */
export const resolveRecordLabel = (
  record: any,
  resourceName: string,
  manifestPrimaryField?: string,
  specSchema?: any
): string => {
  if (!record) return `Edit ${resourceName}`;

  let primaryField = manifestPrimaryField;

  if (!primaryField && specSchema) {
    primaryField = getPrimaryField(specSchema);
  }

  const primaryValue = (primaryField && record[primaryField] !== undefined && record[primaryField] !== null) 
    ? record[primaryField] 
    : record.id;
    
  return primaryValue !== undefined ? `Edit ${resourceName}: ${primaryValue}` : `Edit ${resourceName}`;
};
