import { useMemo, useEffect } from 'react';
import { Autocomplete, TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { WidgetValueProps, WidgetMetaProps } from '../../core/WidgetRegistry';
import { getStatusMessage } from '../AccessibilityUtils';
import { BaseWidget } from './BaseWidget';
import { useAccessibility } from '../../core/AccessibilityContext';

const resolveDomain = (widgetProps: Record<string, unknown>): string | undefined => {
  const domain = widgetProps?.domain;
  return typeof domain === 'string' ? domain : undefined;
};

// Mock data or logic to simulate search results
const mockTerminologyDb: Record<string, string[]> = {
  AE: ['Adverse Event 1', 'Adverse Event 2', 'Allergic Reaction'],
  CM: ['Concomitant Medication A', 'Concomitant Medication B'],
};

const AnnounceEmptyStatus = () => {
  const { announce } = useAccessibility();
  useEffect(() => {
    announce(getStatusMessage('empty'), 'polite');
  }, [announce]);
  return <span>{getStatusMessage('empty')}</span>;
};

/**
 * Generated description.
 *
 */
export const TerminologyLookupInput: React.FC<WidgetValueProps & WidgetMetaProps> = ({ source, value, setValue, widgetProps, schemaNode }) => {
  const domain = resolveDomain(widgetProps) || 'AE';
  const options = useMemo(() => mockTerminologyDb[domain] || [], [domain]);

  return (
    <BaseWidget schemaNode={schemaNode}>
      <Autocomplete
        options={options}
        value={typeof value === 'string' && value ? value : null}
        onChange={(_event, newValue) => setValue(newValue || '')}
        noOptionsText={<AnnounceEmptyStatus />}
        renderInput={(params) => (
          <TextField {...(params as any)}
            
            name={source}
            label="Terminology Lookup"
            helperText={domain ? `Lookup in domain: ${domain}` : undefined}
            InputProps={{
              ...(params as any).InputProps,
              endAdornment: (
                <>
                  {(params as any).InputProps?.endAdornment}
                  <InputAdornment position="end" aria-hidden="true">
                    <SearchIcon aria-hidden="true" />
                  </InputAdornment>
                </>
              ),
            }}
          />
        )}
      />
    </BaseWidget>
  );
};
