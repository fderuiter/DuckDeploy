
import { Create, Edit, SimpleForm, TextInput, useCreateContext, useEditContext } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { renderPrecomputedInput, type PrecomputedInputDescriptor } from './SchemaToFieldMapper';
import { Box } from '@mui/material';
import { useEffect, useState } from 'react';

const FormAccessibilityWrapper = ({ contextHook, children }: { contextHook: () => any, children: React.ReactNode }) => {
  const context = contextHook();
  const isLoading = context?.isLoading;
  const isSaving = context?.isSaving;
  const [announcement, setAnnouncement] = useState('');
  const [wasSaving, setWasSaving] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setAnnouncement('Loading record');
    }
  }, [isLoading]);

  useEffect(() => {
    if (isSaving) {
      setAnnouncement('Saving');
      setWasSaving(true);
    } else if (wasSaving && !isSaving) {
      setAnnouncement('Save complete');
      setWasSaving(false);
    }
  }, [isSaving, wasSaving]);

  return (
    <>
      <Box 
        aria-live="polite" 
        sx={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clipPath: 'inset(100%)', whiteSpace: 'nowrap', border: 0 }}
      >
        {announcement}
      </Box>
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
