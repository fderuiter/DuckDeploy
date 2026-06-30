# Extensibility

DuckDeploy is built on React-Admin. While the application aims to minimize boilerplate by dynamically discovering components from OpenAPI, it also offers comprehensive escape hatches for custom UI development.

## ResourceFactory

The `ResourceFactory` component (`src/components/ResourceFactory.tsx`) bridges the gap between OpenAPI metadata and React-Admin's `<Resource />` registration.

When the application bootstraps, it invokes `resolveAdminResources` to configure available models based on the build-time generated `ui-manifest.json`. For every model with recognized endpoints in the manifest, `ResourceFactory` will mount a dynamic resource with custom 'Auto' wrapper components (`AutoList`, `AutoCreate`, `AutoEdit`).

## Custom 'Auto' Components

By default, `ResourceFactory` wires up the resources to use `AutoList`, `AutoCreate`, and `AutoEdit`. You can also manually mount resources in `App.tsx` and use the Auto components yourself to save time writing boilerplate, while keeping manual control over resource registration.

### AutoList

The `AutoList` component (`src/components/AutoList.tsx`) automatically generates a generic React-Admin `<List>` and `<Datagrid>`. It uses `ui-manifest.json` to extract table columns.

```tsx
import { Resource } from 'react-admin';
import { AutoList } from './components/AutoList';

// Explicitly registering a resource that uses AutoList
<Resource name="users" list={AutoList} />
```

If you need a custom view for a specific resource, you can bypass `AutoList` and provide standard React-Admin components:

```tsx
// Example of bypassing an AutoList
import { List, Datagrid, TextField, BooleanField } from 'react-admin';

export const CustomUserList = (props) => (
  <List {...props}>
    <Datagrid rowClick="edit">
      <TextField source="id" />
      <TextField source="username" />
      <BooleanField source="isActive" />
    </Datagrid>
  </List>
);
```

### AutoForm (AutoCreate & AutoEdit)

`AutoCreate` and `AutoEdit` in `src/components/AutoForm.tsx` inspect the respective JSON request bodies from the OpenAPI schema and dynamically render standard React-Admin inputs via `SchemaToFieldMapper`.

```tsx
import { Resource } from 'react-admin';
import { AutoCreate, AutoEdit } from './components/AutoForm';

// Explicitly registering forms with the Auto components
<Resource 
  name="users" 
  create={AutoCreate} 
  edit={AutoEdit} 
/>
```

If an endpoint needs complex user input handling beyond standard mappings, you can define your own `<Create>` or `<Edit>` blocks:

```tsx
// Example of bypassing an AutoEdit
import { Edit, SimpleForm, TextInput, BooleanInput } from 'react-admin';

export const CustomUserEdit = (props) => (
  <Edit {...props}>
    <SimpleForm>
      <TextInput source="id" disabled />
      <TextInput source="username" />
      <BooleanInput source="isActive" />
    </SimpleForm>
  </Edit>
);
```

## Integrating Overrides

Currently, the primary entry point to override components is to modify `src/App.tsx` and conditionally pass a custom component in the `<Admin>` setup, or inject custom components into the `ResourceFactory` pipeline.
