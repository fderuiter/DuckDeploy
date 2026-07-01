import { useMemo } from 'react';
import { Autocomplete, TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { EngineContext } from '../../core/WidgetRegistry';
import { VisuallyHidden, getStatusMessage } from '../AccessibilityUtils';
import { useSchemaMetadata } from '../../core/useSchemaMetadata';

const resolveDomain = (widgetProps: Record<string, unknown>): string | undefined => {
  const domain = widgetProps?.domain;
  return typeof domain === 'string' ? domain : undefined;
};

// Mock data or logic to simulate search results
const mockTerminologyDb: Record<string, string[]> = {
  AE: ['Adverse Event 1', 'Adverse Event 2', 'Allergic Reaction'],
  CM: ['Concomitant Medication A', 'Concomitant Medication B'],
};

/**
 * Generated description.
 *
 */
export const TerminologyLookupInput: React.FC<EngineContext> = ({ source, value, setValue, widgetProps, schemaNode }) => {
  const domain = resolveDomain(widgetProps) || 'AE';
  const options = useMemo(() => mockTerminologyDb[domain] || [], [domain]);
  const { description } = useSchemaMetadata(schemaNode);

  return (
    <Autocomplete
      options={options}
      value={typeof value === 'string' && value ? value : null}
      onChange={(_event, newValue) => setValue(newValue || '')}
      noOptionsText={
        <>
          No options
          <VisuallyHidden aria-live="polite">
            {getStatusMessage('empty')}
          </VisuallyHidden>
        </>
      }
      renderInput={(params) => (
        <TextField
          {...params}
          name={source}
          label="Terminology Lookup"
          helperText={domain ? `Lookup in domain: ${domain}` : undefined}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {params.InputProps?.endAdornment}
                <InputAdornment position="end" aria-hidden="true">
                  <SearchIcon aria-hidden="true" />
                </InputAdornment>
              </>
            ),
          }}
          inputProps={{
            ...params.inputProps,
            'aria-description': description,
          }}
        />
      )}
    />
  );
};
