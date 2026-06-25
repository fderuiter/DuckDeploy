import { List, Datagrid, TextField, useListContext } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { renderPrecomputedField, type PrecomputedFieldDescriptor } from './SchemaToFieldMapper';
import { VisuallyHidden, getStatusMessage } from './AccessibilityUtils';

const ListAccessibilityWrapper = ({ children }: { children: React.ReactNode }) => {
  const { isLoading, data, total } = useListContext();
  
  let announcement = '';
  if (isLoading) {
    announcement = getStatusMessage('loading');
  } else if (data) {
    if (data.length === 0 || total === 0) {
      announcement = getStatusMessage('empty');
    } else {
      announcement = getStatusMessage('loaded', total || data.length);
    }
  }

  return (
    <>
      <VisuallyHidden aria-live="polite">
        {announcement}
      </VisuallyHidden>
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
