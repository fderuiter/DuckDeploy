import { TextInput } from 'react-admin';
import type { EngineContext } from '../../core/WidgetRegistry';

export const CustomMapWidget: React.FC<EngineContext> = ({ source, value, setValue }) => {
  return (
    <div style={{ border: '1px solid #89a', borderRadius: 4, padding: 12 }}>
      <h4 style={{ marginTop: 0 }}>Custom Map Widget</h4>
      <TextInput
        source={source}
        label="Map Coordinates"
        helperText="Sample override widget (lat,lng)."
        defaultValue={typeof value === 'string' ? value : undefined}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
};
