import { useMemo } from 'react';
import { validateHeading } from '@duckdeploy/openapi';

/**
 * Hook to extract and validate schema metadata.
 */
export const useSchemaMetadata = (schemaNode: any) => {
  return useMemo(() => {
    const headingLevel = schemaNode?.uiExtensions?.['x-ui-headingLevel'] as string;
    const validHeading = validateHeading(headingLevel);
    
    const headingVariant = schemaNode?.uiExtensions?.['x-ui-headingVariant'] as string;
    const validVariant = validateHeading(headingVariant);
    
    const description = schemaNode?.description || '';
    const title = schemaNode?.title || '';
    
    return {
      headingLevel: validHeading,
      headingVariant: validVariant,
      description,
      title
    };
  }, [schemaNode]);
};
