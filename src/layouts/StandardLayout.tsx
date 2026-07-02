import React, { useEffect, useRef } from 'react';
import { Layout } from 'react-admin';
import { useLocation } from 'react-router-dom';
import { Box, Link } from '@mui/material';
import { useAccessibility } from '../core/AccessibilityContext';

/**
 * Generated description.
 *
 */
export const StandardLayout = ({ children, ...props }: React.ComponentProps<typeof Layout>) => {
  const location = useLocation();
  const { announce, reset } = useAccessibility();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = location.pathname;
      
      // Clear pending announcements and focus shifts from previous route
      reset();
      
      // Announce the route change and coordinate focus shift
      announce(`Navigated to ${location.pathname}`, 'polite', mainContentRef);
    }
  }, [location.pathname, announce, reset]);

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
          '&:focus-within': {
            top: 0,
            left: 0,
            zIndex: 9999,
            backgroundColor: 'background.paper',
            padding: 2,
            boxShadow: 1,
          },
        }}
      >
        <Link href="#main-content" color="primary">
          Skip to main content
        </Link>
      </Box>
      <Layout {...props}>
        <Box
          id="main-content"
          ref={mainContentRef}
          tabIndex={-1}
          sx={{ outline: 'none', height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          {children}
        </Box>
      </Layout>
    </>
  );
};
