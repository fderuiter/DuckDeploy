
import { Create, Edit, SimpleForm, TextInput, useCreateContext, useEditContext } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { renderPrecomputedInput, type PrecomputedInputDescriptor } from './SchemaToFieldMapper';
import { useEffect, useState, useRef } from 'react';

import { VisuallyHidden, getStatusMessage } from './AccessibilityUtils';

const FormAccessibilityWrapper = ({ contextHook, children }: { contextHook: () => any, children: React.ReactNode }) => {
  const context = contextHook();
  const isLoading = context?.isLoading;
  const isSaving = context?.isSaving;
  const registerMutationMiddleware = context?.registerMutationMiddleware;
  const unregisterMutationMiddleware = context?.unregisterMutationMiddleware;
  
  const [wasSaving, setWasSaving] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [statusMode, setStatusMode] = useState<'polite' | 'assertive'>('polite');
  
  const saveErrorRef = useRef<any>(null);
  const saveSuccessRef = useRef<boolean>(false);

  useEffect(() => {
    if (isLoading) {
      setStatusText(getStatusMessage('loading'));
      setStatusMode('polite');
    } else if (!isSaving && !wasSaving) {
      setStatusText('');
    }
  }, [isLoading, isSaving, wasSaving]);

  useEffect(() => {
    if (registerMutationMiddleware && unregisterMutationMiddleware) {
      const middleware = async (...args: any[]) => {
        saveErrorRef.current = null;
        saveSuccessRef.current = false;
        const next = args[args.length - 1];
        const newArgs = args.slice(0, -1);
        try {
          const result = await next(...newArgs);
          saveSuccessRef.current = true;
          return result;
        } catch (error: any) {
          saveErrorRef.current = error;
          throw error;
        }
      };
      registerMutationMiddleware(middleware);
      return () => unregisterMutationMiddleware(middleware);
    }
  }, [registerMutationMiddleware, unregisterMutationMiddleware]);

  useEffect(() => {
    if (isSaving) {
      setStatusText(getStatusMessage('saving'));
      setStatusMode('polite');
      setWasSaving(true);
      saveErrorRef.current = null;
      saveSuccessRef.current = false;
    } else if (wasSaving && !isSaving) {
      const error = saveErrorRef.current;
      const success = saveSuccessRef.current;
      
      if (error) {
        const errorMsg = error?.body?.message || error?.message || (typeof error === 'string' ? error : undefined);
        setStatusText(getStatusMessage('error', errorMsg));
        setStatusMode('assertive');
      } else if (success) {
        setStatusText(getStatusMessage('success'));
        setStatusMode('polite');
      }
      
      setWasSaving(false);
      saveErrorRef.current = null;
      saveSuccessRef.current = false;
    }
  }, [isSaving, wasSaving]);

  return (
    <>
      <VisuallyHidden aria-live={statusMode}>
        {statusText}
      </VisuallyHidden>
      {children}
    </>
  );
};

const AutoFormContent = ({ resourceName, isCreate }: { resourceName: string; isCreate: boolean }) => {
  const { uiManifest } = useSpec();
  const precomputedResource = uiManifest?.resources?.[resourceName];
  const precomputedNodes = (isCreate ? precomputedResource?.createForm : precomputedResource?.editForm) as
    | PrecomputedInputDescriptor[]
    | undefined;

  if (precomputedNodes && precomputedNodes.length > 0) {
    return (
      <>
        {precomputedNodes.map((node, index) => renderPrecomputedInput(node, `${resourceName}.${node.source || index}`))}
      </>
    );
  }

  return <TextInput source="id" />;
};

export const AutoCreate = (props: any) => {
  return (
    <Create {...props}>
      <FormAccessibilityWrapper contextHook={useCreateContext}>
        <SimpleForm>
          <AutoFormContent resourceName={props.resource} isCreate={true} />
        </SimpleForm>
      </FormAccessibilityWrapper>
    </Create>
  );
};

export const AutoEdit = (props: any) => {
  return (
    <Edit {...props}>
      <FormAccessibilityWrapper contextHook={useEditContext}>
        <SimpleForm>
          <TextInput source="id" disabled />
          <AutoFormContent resourceName={props.resource} isCreate={false} />
        </SimpleForm>
      </FormAccessibilityWrapper>
    </Edit>
  );
};
