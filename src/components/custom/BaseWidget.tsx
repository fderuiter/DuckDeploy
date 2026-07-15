/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { ElementType, useEffect } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useSchemaMetadata } from '../../core/useSchemaMetadata';
import { useAccessibility } from '../../core/AccessibilityContext';

export interface BaseWidgetProps {
  schemaNode: any;
  children: React.ReactNode;
}

/**
 * BaseWidget acts as a wrapper for custom widgets, providing standardized
 * accessibility structures and layouts using schema metadata.
 */
export const BaseWidget: React.FC<BaseWidgetProps> = ({ schemaNode, children }) => {
  const { headingLevel, headingVariant, description, title } = useSchemaMetadata(schemaNode);
  const { trackMissingMetadata } = useAccessibility();

  useEffect(() => {
    if (!title) {
      trackMissingMetadata(schemaNode?.source || 'widget', 'title');
    }
    if (!description) {
      trackMissingMetadata(schemaNode?.source || 'widget', 'description');
    }
  }, [title, description, schemaNode?.source, trackMissingMetadata]);

  return (
    <Box 
      role="group" 
      aria-label={title || 'Custom Widget'}
      aria-describedby={description ? `desc-${schemaNode.source || 'widget'}` : undefined}
      style={{ 
        border: '1px solid #e0e0e0', 
        borderRadius: 4, 
        padding: 16, 
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      {title && (
        <Typography 
          variant={headingVariant as any} 
          component={headingLevel as ElementType}
        >
          {title}
        </Typography>
      )}
      
      {description && (
        <Typography 
          variant="body2" 
          color="textSecondary"
          id={`desc-${schemaNode.source || 'widget'}`}
        >
          {description}
        </Typography>
      )}

      <Box style={{ marginTop: 8 }}>
        {children}
      </Box>
    </Box>
  );
};
