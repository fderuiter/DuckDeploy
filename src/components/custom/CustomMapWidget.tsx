import { useState, useRef } from 'react';
import { TextInput } from 'react-admin';
import type { WidgetValueProps, WidgetMetaProps } from '../../core/WidgetRegistry';
import PlaceIcon from '@mui/icons-material/Place';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { BaseWidget } from './BaseWidget';
import { useAccessibility } from '../../core/AccessibilityContext';

/**
 * Generated description.
 *
 */
export const CustomMapWidget: React.FC<WidgetValueProps & Pick<WidgetMetaProps, 'schemaNode'>> = ({ source, value, setValue, schemaNode }) => {
  const [markers] = useState([{ id: 1, lat: 40.7128, lng: -74.0060, label: 'New York', status: 'Active' }]);

  const [listView, setListView] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  const { announce, shiftFocus } = useAccessibility();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLUListElement>(null);

  const handleSelect = (marker: typeof markers[0]) => {
    setSelectedId(marker.id);
    setValue(`${marker.lat},${marker.lng}`);
  };

  const handleViewToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isList = e.target.checked;
    setListView(isList);
    announce(isList ? 'Switched to list view' : 'Switched to map view', 'polite');
    shiftFocus(isList ? listContainerRef : mapContainerRef);
  };

  return (
    <BaseWidget schemaNode={schemaNode}>
      <FormControlLabel
        control={<Switch checked={listView} onChange={handleViewToggle} />}
        label="View as List"
      />

      {!listView ? (
        <div ref={mapContainerRef} tabIndex={-1} className="map-markers" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {markers.map(marker => (
            <IconButton
              key={marker.id}
              className="map-marker"
              aria-label={`Map marker for ${marker.label}`}
              aria-pressed={selectedId === marker.id ? 'true' : 'false'}
              onClick={() => handleSelect(marker)}
              color={selectedId === marker.id ? 'primary' : 'default'}
            >
              <PlaceIcon aria-hidden="true" />
            </IconButton>
          ))}
        </div>
      ) : (
        <List role="listbox" ref={listContainerRef} tabIndex={-1}>
          {markers.map(marker => (
            <ListItem key={marker.id} disablePadding>
              <ListItemButton 
                role="option"
                aria-selected={selectedId === marker.id ? 'true' : 'false'}
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
      />
    </BaseWidget>
  );
};
