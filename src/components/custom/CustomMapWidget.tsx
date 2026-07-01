import { useState } from 'react';
import { TextInput } from 'react-admin';
import type { EngineContext } from '../../core/WidgetRegistry';
import PlaceIcon from '@mui/icons-material/Place';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import type { ElementType } from 'react';
import { useAccessibility } from '../../core/AccessibilityContext';
import { useSchemaMetadata } from '../../core/useSchemaMetadata';

/**
 * Generated description.
 *
 */
export const CustomMapWidget: React.FC<EngineContext> = ({ source, value, setValue, schemaNode }) => {
  const [markers] = useState([{ id: 1, lat: 40.7128, lng: -74.0060, label: 'New York', status: 'Active' }]);

  const [listView, setListView] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { announce } = useAccessibility();
  const { headingLevel, headingVariant, description } = useSchemaMetadata(schemaNode);

  const handleSelect = (marker: typeof markers[0]) => {
    setSelectedId(marker.id);
    setValue(`${marker.lat},${marker.lng}`);
  };

  const handleFocus = (marker: typeof markers[0]) => {
    announce(`Map marker for ${marker.label}. Status: ${marker.status || 'Unknown'}`);
  };

  return (
    <div style={{ border: '1px solid #89a', borderRadius: 4, padding: 12 }}>
      <Typography variant={headingVariant as any} component={headingLevel as ElementType} style={{ marginTop: 0 }}>
        Custom Map Widget
      </Typography>
      
      <FormControlLabel
        control={<Switch checked={listView} onChange={(e) => setListView(e.target.checked)} />}
        label="View as List"
      />

      {!listView ? (
        <div className="map-markers" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {markers.map(marker => (
            <IconButton
              key={marker.id}
              className="map-marker"
              aria-label={`Map marker for ${marker.label}`}
              onClick={() => handleSelect(marker)}
              onFocus={() => handleFocus(marker)}
              color={selectedId === marker.id ? 'primary' : 'default'}
            >
              <PlaceIcon aria-hidden="true" />
            </IconButton>
          ))}
        </div>
      ) : (
        <List>
          {markers.map(marker => (
            <ListItem key={marker.id} disablePadding>
              <ListItemButton 
                selected={selectedId === marker.id}
                onClick={() => handleSelect(marker)}
              >
                <ListItemText primary={marker.label} secondary={`Status: ${marker.status || 'Unknown'}`} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      <TextInput
        source={source}
        label="Map Coordinates"
        helperText="Sample override widget (lat,lng)."
        defaultValue={typeof value === 'string' ? value : undefined}
        onChange={(event) => setValue(event.target.value)}
        aria-description={description}
      />
    </div>
  );
};
