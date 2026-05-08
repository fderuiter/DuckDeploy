
import { List, Datagrid, TextField } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { mapSchemaToField } from './SchemaToFieldMapper';
import { discoverResources } from '../core/discovery';

export const AutoList = (props: any) => {
  const { spec } = useSpec();
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
