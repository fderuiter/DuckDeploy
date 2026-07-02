import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Alert, AlertTitle, Link, Box } from '@mui/material';
import { useFormContext } from 'react-hook-form';
import { useSaveContext } from 'react-admin';
import { useManifestInterpreter } from '../core/useManifestInterpreter';
import { useAccessibility } from '../core/AccessibilityContext';
import type { PrecomputedInputDescriptor } from './SchemaToFieldMapper';

interface SchemaErrorSummaryProps {
  resourceName: string;
  isCreate: boolean;
}

/**
 * Generated description.
 *
 */
export const SchemaErrorSummary: React.FC<SchemaErrorSummaryProps> = ({ resourceName, isCreate }) => {
  const { formState: { errors, isSubmitted, isSubmitting, submitCount } } = useFormContext();
  const saveContext = useSaveContext() as any;
  const { precomputedResource } = useManifestInterpreter({ resource: resourceName, mode: isCreate ? 'create' : 'edit' });
  const alertRef = useRef<HTMLDivElement>(null);
  const { shiftFocus } = useAccessibility();
  const [hasFailed, setHasFailed] = useState(false);

  const precomputedNodes = useMemo(() => {
    return (isCreate ? precomputedResource?.createForm : precomputedResource?.editForm) as
      | PrecomputedInputDescriptor[]
      | undefined;
  }, [precomputedResource, isCreate]);

  // Flatten precomputed nodes to easily look up descriptions
  const schemaMap = useMemo(() => {
    const map: Record<string, { title?: string, description?: string }> = {};
    const traverse = (nodes: any[]) => {
      nodes.forEach(node => {
        if (!node.source) return;
        map[node.source] = { title: node.title, description: node.description };
        if (node.children) traverse(node.children);
        if (node.items) traverse(node.items);
      });
    };
    if (precomputedNodes) traverse(precomputedNodes);
    return map;
  }, [precomputedNodes]);

  // Extract backend validation errors if any
  const backendErrors = useMemo(() => {
    const result: Record<string, string> = {};
    const errorBody = saveContext?.error?.body;
    if (errorBody) {
      if (typeof errorBody.errors === 'object' && !Array.isArray(errorBody.errors)) {
        Object.entries(errorBody.errors).forEach(([k, v]) => {
          if (typeof v === 'string') result[k] = v;
        });
      } else if (Array.isArray(errorBody.details)) {
        errorBody.details.forEach((d: any) => {
          if (typeof d === 'string') result['backend_error'] = d;
          if (d.field && d.message) result[d.field] = d.message;
        });
      }
    }
    return result;
  }, [saveContext?.error]);

  // Flatten react-hook-form errors
  const clientErrors = useMemo(() => {
    const result: Record<string, string> = {};
    const flatten = (obj: any, prefix = '') => {
      if (!obj) return;
      for (const [key, value] of Object.entries(obj)) {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && (value as any).message) {
          result[newPrefix] = (value as any).message;
        } else if (value && typeof value === 'object') {
          flatten(value, newPrefix);
        }
      }
    };
    flatten(errors);
    return result;
  }, [errors]);

  const activeErrors = useMemo(() => {
    return { ...clientErrors, ...backendErrors };
  }, [clientErrors, backendErrors]);

  const errorList = Object.entries(activeErrors);

  useEffect(() => {
    if (isSubmitting) {
      setHasFailed(false);
    } else if (isSubmitted && errorList.length > 0) {
      setHasFailed(true);
    }
  }, [isSubmitting, isSubmitted, errorList.length]);

  useEffect(() => {
    if (hasFailed && alertRef.current) {
      // The AccessibilityContext focuses [role="alert"]. We ensure it receives focus.
      shiftFocus(alertRef);
    }
  }, [hasFailed, submitCount, shiftFocus]);

  if (!hasFailed || errorList.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="error" role="alert" ref={alertRef} tabIndex={-1}>
        <AlertTitle tabIndex={-1}>Please correct the following errors:</AlertTitle>
        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
          {errorList.map(([field, message]) => {
            const schemaInfo = schemaMap[field];
            const label = schemaInfo?.title || field;
            
            return (
              <li key={field}>
                <Link
                  component="button"
                  variant="body2"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    const input = document.querySelector(`[name="${field}"], [id="${field}"]`) as HTMLElement;
                    if (input) {
                      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      shiftFocus(input);
                    }
                  }}
                  sx={{ textAlign: 'left' }}
                >
                  <strong>{label}:</strong> {message}{schemaInfo?.description ? ` - ${schemaInfo.description}` : ''}
                </Link>
              </li>
            );
          })}
        </ul>
      </Alert>
    </Box>
  );
};
