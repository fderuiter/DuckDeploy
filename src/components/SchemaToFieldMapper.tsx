
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
  ChipField
} from 'react-admin';

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

export const mapSchemaToInput = (name: string, property: any, isRequired: boolean) => {
  const commonProps = {
    key: name,
    source: name,
    required: isRequired,
  };

  if (name.endsWith('_id') || name.endsWith('Id') || property.$ref) {
    const target = name.replace(/_id$/i, '').replace(/Id$/, '');
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
