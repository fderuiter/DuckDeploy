import {
  TextField,
  DateField,
  BooleanField,
  NumberField,
  ReferenceField,
  SelectField,
  TextInput,
  DateInput,
  BooleanInput,
  NumberInput,
  ReferenceInput,
  SelectInput,
  ArrayField,
  SingleFieldList,
  ChipField,
  ArrayInput,
  SimpleFormIterator
} from 'react-admin';
import { OpenAPIV3 } from 'openapi-types';
import { buildValidators } from './validators';
import { PolymorphicInput } from './PolymorphicInput';
import { JsonEditorInput } from './custom/JsonEditorInput';
import { TerminologyLookupInput } from './custom/TerminologyLookupInput';

export const mapSchemaToField = (name: string, property: any) => {
  // Check for reference
  if (name.endsWith('_id') || name.endsWith('Id') || property.$ref) {
    const target = name.replace(/_id$/i, '').replace(/Id$/, '');
    return (
      <ReferenceField key={name} source={name} reference={target}>
        <TextField source="id" />
      </ReferenceField>
    );
  }

  if (property.enum) {
    const choices = property.enum.map((val: string) => ({ id: val, name: val }));
    return <SelectField key={name} source={name} choices={choices} />;
  }

  if (property.type === 'boolean') {
    return <BooleanField key={name} source={name} />;
  }

  if (property.type === 'integer' || property.type === 'number') {
    return <NumberField key={name} source={name} />;
  }

  if (property.type === 'string') {
    if (property.format === 'date' || property.format === 'date-time') {
      return <DateField key={name} source={name} />;
    }
    return <TextField key={name} source={name} />;
  }

  if (property.type === 'array') {
     return (
       <ArrayField key={name} source={name}>
         <SingleFieldList>
           <ChipField source="id" />
         </SingleFieldList>
       </ArrayField>
     );
  }

  // Fallback
  return <TextField key={name} source={name} />;
};

export const mapSchemaToInput = (
  source: string,
  property: OpenAPIV3.SchemaObject,
  isRequired: boolean,
  depth: number = 0
): React.ReactNode => {
  if (depth > 5) return null; // Infinite recursion guard

  const validators = buildValidators(property, isRequired);
  const commonProps = {
    key: source,
    source,
    validate: validators,
    isRequired, // Needed for simple reference/boolean inputs to display asterisk
    parse: (value: any) => (value === '' ? null : value), // Serialize empty fields to mathematical nulls
  };

  // 1. Check for custom vendor extensions first
  if (property['x-widget'] === 'json-editor') {
    return <JsonEditorInput {...commonProps} />;
  }

  if (property['x-widget'] === 'cdisc-terminology-lookup') {
    return (
      <TerminologyLookupInput
        {...commonProps}
        domain={property['x-terminology-domain'] as string}
      />
    );
  }

  // Polymorphism
  if (property.oneOf || property.anyOf) {
    const schemas = (property.oneOf || property.anyOf) as OpenAPIV3.SchemaObject[];
    return <PolymorphicInput key={source} source={source} schemas={schemas} isRequired={isRequired} depth={depth + 1} />;
  }

  // Nested Objects
  if (property.type === 'object' && property.properties) {
    return (
      <div key={source} style={{ marginLeft: '1rem', borderLeft: '2px solid #eee', paddingLeft: '1rem' }}>
        <h4>{property.title || source.split('.').pop() || source}</h4>
        {Object.entries(property.properties).map(([subName, subProp]) => {
          const nestedSource = source ? `${source}.${subName}` : subName;
          return mapSchemaToInput(
            nestedSource,
            subProp as OpenAPIV3.SchemaObject,
            (property.required || []).includes(subName),
            depth + 1
          );
        })}
      </div>
    );
  }

  // Arrays
  if (property.type === 'array' && property.items) {
    const itemSchema = property.items as OpenAPIV3.SchemaObject;

    return (
      <ArrayInput {...commonProps}>
        <SimpleFormIterator inline>
          {itemSchema.type === 'object' && itemSchema.properties ? (
            Object.entries(itemSchema.properties).map(([subName, subProp]) =>
              mapSchemaToInput(
                subName,
                subProp as OpenAPIV3.SchemaObject,
                (itemSchema.required || []).includes(subName),
                depth + 1
              )
            )
          ) : (
            mapSchemaToInput('', itemSchema, false, depth + 1)
          )}
        </SimpleFormIterator>
      </ArrayInput>
    );
  }

  if (source.endsWith('_id') || source.endsWith('Id') || '$ref' in property) {
    const target = source.replace(/_id$/i, '').replace(/Id$/, '');
    return (
      <ReferenceInput {...commonProps} reference={target}>
        <SelectInput optionText="id" />
      </ReferenceInput>
    );
  }

  if (property.enum) {
    const choices = property.enum.map((val: string) => ({ id: val, name: val }));
    return <SelectInput {...commonProps} choices={choices} />;
  }

  if (property.type === 'boolean') {
    return <BooleanInput {...commonProps} />;
  }

  if (property.type === 'integer' || property.type === 'number') {
    return <NumberInput {...commonProps} />;
  }

  if (property.type === 'string') {
    if (property.format === 'date' || property.format === 'date-time') {
      return <DateInput {...commonProps} />;
    }
    return <TextInput {...commonProps} />;
  }

  // Fallback
  return <TextInput {...commonProps} />;
};
