
import { Create, Edit, SimpleForm, TextInput } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { mapSchemaToInput } from './SchemaToFieldMapper';
import { discoverResources } from '../core/discovery';

const AutoFormContent = ({ resourceDef, isCreate }: { resourceDef: any; isCreate: boolean }) => {
  const schema = isCreate ? resourceDef.createRequestBodySchema : resourceDef.editRequestBodySchema;

  if (!schema || !schema.properties) {
    return <TextInput source="id" />;
  }

  const properties = schema.properties;
  const required = schema.required || [];

  return (
    <>
      {Object.entries(properties).map(([name, propSchema]) =>
        mapSchemaToInput(name, propSchema, required.includes(name))
      )}
    </>
  );
};

export const AutoCreate = (props: any) => {
  const { spec } = useSpec();
  const resources = discoverResources(spec);
  const resourceDef = resources.find(r => r.name === props.resource);

  return (
    <Create {...props}>
      <SimpleForm>
        {resourceDef ? <AutoFormContent resourceDef={resourceDef} isCreate={true} /> : <TextInput source="id" />}
      </SimpleForm>
    </Create>
  );
};

export const AutoEdit = (props: any) => {
  const { spec } = useSpec();
  const resources = discoverResources(spec);
  const resourceDef = resources.find(r => r.name === props.resource);

  return (
    <Edit {...props}>
      <SimpleForm>
        <TextInput source="id" disabled />
        {resourceDef ? <AutoFormContent resourceDef={resourceDef} isCreate={false} /> : null}
      </SimpleForm>
    </Edit>
  );
};
