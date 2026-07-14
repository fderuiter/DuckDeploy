import React from 'react';
import { TextInput } from 'react-admin';
import { useManifestInterpreter } from '../core/useManifestInterpreter';
import { renderInput, type PrecomputedInputDescriptor } from '../components/SchemaToFieldMapper';
import { SchemaErrorSummary } from '../components/SchemaErrorSummary';

/**
 * Shared hook to set up the configuration, layout, and rendering nodes for dynamic forms.
 * It determines whether it's a create or edit form based on the mode and provides
 * appropriately rendered content nodes, error summary, and layout details.
 *
 * @param resource - The explicit resource name to render a form for.
 * @param mode - The type of form being rendered ('create' or 'edit').
 * @returns An object containing form setup details like layout configuration and rendered components.
 */
export function useAutoFormSetup(resource: string | undefined, mode: 'create' | 'edit') {
  const { resourceName, precomputedResource, layoutConfig, CustomLayout } = useManifestInterpreter({ resource, mode });

  const isCreate = mode === 'create';
  const precomputedNodes = (isCreate ? precomputedResource?.createForm : precomputedResource?.editForm) as PrecomputedInputDescriptor[] | undefined;

  let contentNodes: React.ReactNode[];
  if (precomputedNodes && precomputedNodes.length > 0) {
    contentNodes = precomputedNodes.map((node, index) => 
      renderInput(node, `${resourceName}.${node.source || index}`)
    );
  } else {
    contentNodes = [<TextInput key={isCreate ? "id" : "id-fallback"} source="id" />];
  }

  const errorSummary = <SchemaErrorSummary key="error-summary" resourceName={resourceName} isCreate={isCreate} />;
  const idInput = !isCreate ? <TextInput key="id-disabled" source="id" disabled /> : null;

  return {
    resourceName,
    layoutConfig,
    CustomLayout,
    contentNodes,
    errorSummary,
    idInput
  };
}
