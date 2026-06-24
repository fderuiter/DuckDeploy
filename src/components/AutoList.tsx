
import { List, Datagrid, TextField } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { renderPrecomputedField, type PrecomputedFieldDescriptor } from './SchemaToFieldMapper';

export const AutoList = (props: any) => {
  const { uiManifest } = useSpec();
  const precomputedResource = uiManifest?.resources?.[props.resource];
  const precomputedListFields = precomputedResource?.listFields as PrecomputedFieldDescriptor[] | undefined;

  if (precomputedListFields && precomputedListFields.length > 0) {
    const idField = precomputedListFields.find(field => field.source === 'id');
    const nonIdFields = precomputedListFields.filter(field => field.source !== 'id');

    return (
      <List {...props}>
        <Datagrid rowClick="edit">
          {idField ? renderPrecomputedField(idField, `${props.resource}.id`) : <TextField source="id" />}
          {nonIdFields.map((field, index) =>
            renderPrecomputedField(field, `${props.resource}.${field.source || index}`)
          )}
        </Datagrid>
      </List>
    );
  }

  return (
    <List {...props}>
      <Datagrid>
        <TextField source="id" />
      </Datagrid>
    </List>
  );
};
