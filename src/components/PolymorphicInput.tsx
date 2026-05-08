import { FormDataConsumer, SelectInput, required } from 'react-admin';
import { get } from 'lodash';
import { OpenAPIV3 } from 'openapi-types';
import { mapSchemaToInput } from './SchemaToFieldMapper';

export const PolymorphicInput = ({
  source,
  schemas,
  isRequired,
  depth = 0
}: {
  source: string,
  schemas: OpenAPIV3.SchemaObject[],
  isRequired: boolean,
  depth?: number
}) => {
  // Create dropdown choices based on schema titles or types
  const choices = schemas.map((s, index) => ({
    id: index,
    name: s.title || `Option ${index + 1} (${s.type})`
  }));

  // We use a hidden meta-field to track which schema the user selected
  const typeSource = `${source}__schemaIndex`;

  return (
    <div style={{ padding: '1rem', border: '1px dashed #ccc' }}>
      <SelectInput
        source={typeSource}
        choices={choices}
        label="Select Type"
        validate={isRequired ? [required()] : []}
      />

      <FormDataConsumer>
        {({ formData }) => {
          const selectedIndex = get(formData, typeSource);
          if (selectedIndex === undefined) return null;

          const activeSchema = schemas[selectedIndex];
          return mapSchemaToInput(source, activeSchema, isRequired, depth);
        }}
      </FormDataConsumer>
    </div>
  );
};
