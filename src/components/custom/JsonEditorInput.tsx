import { TextInput } from 'react-admin';
import type { WidgetValueProps, WidgetMetaProps } from '../../core/WidgetRegistry';
import { useSchemaMetadata } from '../../core/useSchemaMetadata';

/**
 * Generated description.
 *
 */
export const JsonEditorInput: React.FC<WidgetValueProps & Pick<WidgetMetaProps, 'schemaNode'>> = ({ source, value, setValue, schemaNode }) => {
  const { description } = useSchemaMetadata(schemaNode);
  return (
    <TextInput
      source={source}
      defaultValue={typeof value === 'string' ? value : undefined}
      onChange={(event) => setValue(event.target.value)}
      multiline
      fullWidth
      aria-description={description}
    />
  );
};
