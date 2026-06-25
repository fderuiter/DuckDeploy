import { useState } from 'react';
import { TextInput } from 'react-admin';
import type { EngineContext } from '../../core/WidgetRegistry';
import PlaceIcon from '@mui/icons-material/Place';

export const CustomMapWidget: React.FC<EngineContext> = ({ source, value, setValue, schemaNode }) => {
  const [markers] = useState([{ id: 1, lat: 40.7128, lng: -74.0060, label: 'New York' }]);

  return (
    <div style={{ border: '1px solid #89a', borderRadius: 4, padding: 12 }}>
      <h4 style={{ marginTop: 0 }}>Custom Map Widget</h4>
      <div className="map-markers" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        {markers.map(marker => (
          <div key={marker.id} className="map-marker" role="img" aria-label={`Map marker for ${marker.label}`}>
            <PlaceIcon aria-hidden="true" />
          </div>
        ))}
      </div>
      <TextInput
        source={source}
        label="Map Coordinates"
        helperText="Sample override widget (lat,lng)."
        defaultValue={typeof value === 'string' ? value : undefined}
        onChange={(event) => setValue(event.target.value)}
        aria-description={schemaNode?.description}
      />
    </div>
  );
};
