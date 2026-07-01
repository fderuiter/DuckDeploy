import { TextInput } from 'react-admin';
import type { EngineContext } from '../../core/WidgetRegistry';

/**
 * Generated description.
 *
 */
export const JsonEditorInput: React.FC<EngineContext> = ({ source, value, setValue, schemaNode }) => {
  return (
    <TextInput
      source={source}
      defaultValue={typeof value === 'string' ? value : undefined}
      onChange={(event) => setValue(event.target.value)}
      multiline
      fullWidth
      aria-description={schemaNode?.description}
    />
  );
};
