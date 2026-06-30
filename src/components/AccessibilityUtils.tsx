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

export const getStatusMessage = (translate: any, state: OperationState, details?: string | number): string => {
  switch (state) {
    case 'loading':
      return translate('duckdeploy.a11y.status.loading');
    case 'saving':
      return translate('duckdeploy.a11y.status.saving');
    case 'success':
      return translate('duckdeploy.a11y.status.success');
    case 'error':
      return details ? translate('duckdeploy.a11y.status.error_details', { details }) : translate('duckdeploy.a11y.status.error');
    case 'empty':
      return translate('duckdeploy.a11y.status.empty');
    case 'loaded':
      return translate('duckdeploy.a11y.status.loaded', { details: details || 0 });
    default:
      return '';
  }
};
