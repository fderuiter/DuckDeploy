import { useMemo } from 'react';

/**
 * Hook to extract and sanitize schema metadata (headings, titles, descriptions).
 * @param {any} schemaNode - The OpenAPI schema node.
 * @returns {object} Extracted metadata properties.
 */
export const useSchemaMetadata = (schemaNode: any) => {
  return useMemo(() => {
    const headingLevel = schemaNode?.uiExtensions?.['x-ui-headingLevel'] as string;
    const validHeading = typeof headingLevel === 'string' && /^h[1-6]$/.test(headingLevel) ? headingLevel : 'h4';
    
    const headingVariant = schemaNode?.uiExtensions?.['x-ui-headingVariant'] as string;
    const validVariant = typeof headingVariant === 'string' && /^h[1-6]$/.test(headingVariant) ? headingVariant : 'h4';
    
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
