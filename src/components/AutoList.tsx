
import { List, Datagrid, TextField, useListContext } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { renderPrecomputedField, type PrecomputedFieldDescriptor } from './SchemaToFieldMapper';
import { Box } from '@mui/material';

const ListAccessibilityWrapper = ({ children }: { children: React.ReactNode }) => {
  const { isLoading, data, total } = useListContext();
  
  let announcement = '';
  if (isLoading) {
    announcement = 'Loading list data';
  } else if (data) {
    if (data.length === 0 || total === 0) {
      announcement = 'Empty list';
    } else {
      announcement = `Loaded ${total || data.length} items`;
    }
  }

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

export const AutoList = (props: any) => {
  const { uiManifest } = useSpec();
  const precomputedResource = uiManifest?.resources?.[props.resource];
  const precomputedListFields = precomputedResource?.listFields as PrecomputedFieldDescriptor[] | undefined;

  if (precomputedListFields && precomputedListFields.length > 0) {
    const idField = precomputedListFields.find(field => field.source === 'id');
    const nonIdFields = precomputedListFields.filter(field => field.source !== 'id');

    return (
      <List {...props}>
        <ListAccessibilityWrapper>
          <Datagrid rowClick="edit">
            {idField ? renderPrecomputedField(idField, `${props.resource}.id`) : <TextField source="id" />}
            {nonIdFields.map((field, index) =>
              renderPrecomputedField(field, `${props.resource}.${field.source || index}`)
            )}
          </Datagrid>
        </ListAccessibilityWrapper>
      </List>
    );
  }

  return (
    <List {...props}>
      <ListAccessibilityWrapper>
        <Datagrid>
          <TextField source="id" />
        </Datagrid>
      </ListAccessibilityWrapper>
    </List>
  );
};
