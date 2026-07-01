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

## Custom Widgets and the WidgetRegistry

For complex inputs that cannot be mapped by standard React-Admin inputs, you can create custom widgets. The Advanced Widget Developer SDK provides tools to register and implement custom components without having to write boilerplate code.

### Registering a Widget

You can register your custom widget globally during application startup. Use the `registerWidget` function from the `WidgetRegistry` API:

```tsx
import { registerWidget } from './core/WidgetRegistry';
import { MyCustomWidget } from './features/MyCustomWidget';

registerWidget('my-custom-widget', MyCustomWidget);
```

To tell the schema-driven form engine to use your widget for a specific field, use the `x-ui-widget` schema property in your OpenAPI definition:

```yaml
properties:
  customField:
    type: string
    x-ui-widget: my-custom-widget
```

### The `mutate` Prop and `setValue`

Custom widgets receive a standard set of props from the `EngineContext`, including `mutate` and `setValue`. 

- `setValue(value)`: This prop remains fully supported for backward compatibility and is used to update the current field's value in the form state.
- `mutate(operation, payload)`: This prop provides direct access to data provider operations. The form engine automatically binds this function to the active `dataProvider`, eliminating the need for boilerplate context usage.

### Handling Side-Effects with `useWidgetMutation`

The SDK provides a `useWidgetMutation` hook that manages `loading`, `error`, and side effects for widget mutations. This greatly simplifies implementing interactions like executing an API call and updating the form state based on the result.

Here is a complete working code example of a custom widget that performs an asynchronous side-effect, fetches data, and sets the value using backward-compatible `setValue`:

```tsx
import React from 'react';
import { Button, CircularProgress } from '@mui/material';
import { EngineContext, useWidgetMutation } from '../core/WidgetRegistry';

export const FetchUserWidget: React.FC<EngineContext> = (props) => {
  const { execute, isLoading, error } = useWidgetMutation(props.mutate, {
    onSuccess: (data) => {
      // Use the backward compatible setValue pattern to update the field
      props.setValue(data.data.username);
    },
    onError: (err) => {
      console.error('Failed to fetch user:', err);
    }
  });

  const handleClick = () => {
    // Trigger a side effect using the data provider's getOne operation
    execute('getOne', { resource: 'users', id: 123 });
  };

  return (
    <div>
      <Button 
        variant="contained" 
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? <CircularProgress size={24} /> : 'Fetch User Data'}
      </Button>
      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
      <div style={{ marginTop: '10px' }}>
        Current Value: {props.value as string}
      </div>
    </div>
  );
};
```
