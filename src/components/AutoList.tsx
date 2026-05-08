
import { List, Datagrid, TextField } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { mapSchemaToField, renderPrecomputedField, type PrecomputedFieldDescriptor } from './SchemaToFieldMapper';
import { discoverResources } from '../core/discovery';

export const AutoList = (props: any) => {
  const { spec, uiManifest } = useSpec();
  const resources = discoverResources(spec);
  const resourceDef = resources.find(r => r.name === props.resource);

  if (!resourceDef || !resourceDef.listResponseSchema) {
    return (
      <List {...props}>
        <Datagrid>
          <TextField source="id" />
        </Datagrid>
      </List>
    );
  }

  const schema = resourceDef.listResponseSchema;
  const precomputedResource = uiManifest?.resources?.[resourceDef.name];
  const precomputedListFields = precomputedResource?.listFields as PrecomputedFieldDescriptor[] | undefined;

  if (precomputedListFields && precomputedListFields.length > 0) {
    const idField = precomputedListFields.find(field => field.source === 'id');
    const nonIdFields = precomputedListFields.filter(field => field.source !== 'id');

    return (
      <List {...props}>
        <Datagrid rowClick="edit">
          {idField ? renderPrecomputedField(idField, `${resourceDef.name}.id`) : <TextField source="id" />}
          {nonIdFields.map((field, index) =>
            renderPrecomputedField(field, `${resourceDef.name}.${field.source || index}`)
          )}
        </Datagrid>
      </List>
    );
  }

  // Extract properties
  let properties: Record<string, any> = {};

  // The schema might be an array schema or object with items
  if (schema.type === 'array' && schema.items?.properties) {
    properties = schema.items.properties;
  } else if (schema.properties?.items?.items?.properties) {
    // Some paginated wrappers like { items: { type: "array", items: { properties: {...} } } }
    properties = schema.properties.items.items.properties;
  } else if (schema.properties?.data?.items?.properties) {
    properties = schema.properties.data.items.properties;
  } else if (schema.properties) {
    properties = schema.properties;
  }

  // Fallback if no properties found
  if (Object.keys(properties).length === 0) {
    return (
      <List {...props}>
        <Datagrid>
          <TextField source="id" />
        </Datagrid>
      </List>
    );
  }

  return (
    <List {...props}>
      <Datagrid rowClick="edit">
        {/* Always try to show id first */}
        {properties['id'] ? mapSchemaToField('id', properties['id']) : <TextField source="id" />}

        {Object.entries(properties)
          .filter(([name]) => name !== 'id') // avoid duplicate id
          .map(([name, propSchema]) => mapSchemaToField(name, propSchema))}
      </Datagrid>
    </List>
  );
};
