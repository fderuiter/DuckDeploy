import React, { useState } from 'react';
import { Tooltip, Box, Typography, IconButton } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

export const LabelWithTooltip = ({ label, description, tooltipId }: { label: string; description?: string; tooltipId?: string }) => {
  const [open, setOpen] = useState(false);

  if (!description) {
    return <span>{label}</span>;
  }

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <span>{label}</span>
      <Tooltip
        title={
          <Box sx={{ maxHeight: 200, overflowY: 'auto', p: 0.5 }}>
            <Typography variant="body2">{description}</Typography>
          </Box>
        }
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        enterTouchDelay={0}
        leaveTouchDelay={3000}
        placement="top"
      >
        <IconButton
          size="small"
          aria-label="info"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          sx={{ padding: 0, marginLeft: '4px' }}
          tabIndex={0}
        >
          <InfoOutlinedIcon fontSize="small" color="action" />
        </IconButton>
      </Tooltip>
      {tooltipId && (
        <span id={tooltipId} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}>
          {description}
        </span>
      )}
    </Box>
  );
};
