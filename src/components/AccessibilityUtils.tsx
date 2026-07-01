import React from 'react';
import { Box } from '@mui/material';

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

export const resolveRecordLabel = (
  record: any,
  resourceName: string,
  manifestPrimaryField?: string,
  specSchema?: any
): string => {
  if (!record) return `Edit ${resourceName}`;

  let primaryField = manifestPrimaryField;

  if (!primaryField && specSchema) {
    const ext = specSchema['x-ui-primary-field'];
    if (typeof ext === 'string') {
      primaryField = ext;
    } else if (specSchema.properties) {
      // Check if any property has x-ui-primary-field: true
      const propKeys = Object.keys(specSchema.properties);
      for (const key of propKeys) {
        if (specSchema.properties[key]?.['x-ui-primary-field'] === true) {
          primaryField = key;
          break;
        }
      }
    }
  }

  const primaryValue = (primaryField && record[primaryField] !== undefined && record[primaryField] !== null) 
    ? record[primaryField] 
    : record.id;
    
  return primaryValue !== undefined ? `Edit ${resourceName}: ${primaryValue}` : `Edit ${resourceName}`;
};
