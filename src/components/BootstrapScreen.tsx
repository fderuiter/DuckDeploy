import { Alert, Box, CircularProgress, Stack, Typography } from '@mui/material';
import { VisuallyHidden, getStatusMessage } from './AccessibilityUtils';

interface BootstrapScreenProps {
  title: string;
  message: string;
  details?: string[];
  loading?: boolean;
}

export const BootstrapScreen = ({
  title,
  message,
  details = [],
  loading = false,
}: BootstrapScreenProps) => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      px: 3,
      py: 6,
      bgcolor: '#f5f7fb',
    }}
  >
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 720 }}>
      <Stack spacing={1} alignItems="center" textAlign="center" role={loading ? "status" : undefined}>
        {loading ? (
          <Box position="relative">
            <CircularProgress size={40} aria-hidden="true" />
            <VisuallyHidden>
              {getStatusMessage('loading')}
            </VisuallyHidden>
          </Box>
        ) : null}
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {message}
        </Typography>
      </Stack>

      {details.length > 0 ? (
        <Alert severity={loading ? 'info' : 'error'} role={!loading ? "alert" : undefined}>
          <Stack component="ul" spacing={1} sx={{ m: 0, pl: 3 }}>
            {details.map((detail) => (
              <Typography key={detail} component="li" variant="body2">
                {detail}
              </Typography>
            ))}
          </Stack>
        </Alert>
      ) : null}
    </Stack>
  </Box>
);
