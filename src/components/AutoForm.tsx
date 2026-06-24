
import { Create, Edit, SimpleForm, TextInput } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { renderPrecomputedInput, type PrecomputedInputDescriptor } from './SchemaToFieldMapper';

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
      <SimpleForm>
        <AutoFormContent resourceName={props.resource} isCreate={true} />
      </SimpleForm>
    </Create>
  );
};

export const AutoEdit = (props: any) => {
  return (
    <Edit {...props}>
      <SimpleForm>
        <TextInput source="id" disabled />
        <AutoFormContent resourceName={props.resource} isCreate={false} />
      </SimpleForm>
    </Edit>
  );
};
