import { TextInput } from 'react-admin';
import SearchIcon from '@mui/icons-material/Search';
import { InputAdornment } from '@mui/material';
import type { EngineContext } from '../../core/WidgetRegistry';

const resolveDomain = (widgetProps: Record<string, unknown>): string | undefined => {
  const domain = widgetProps.domain;
  return typeof domain === 'string' ? domain : undefined;
};

export const TerminologyLookupInput: React.FC<EngineContext> = ({ source, value, setValue, widgetProps }) => {
  const domain = resolveDomain(widgetProps);
  return (
    <TextInput
      source={source}
      defaultValue={typeof value === 'string' ? value : undefined}
      onChange={(event) => setValue(event.target.value)}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <SearchIcon />
          </InputAdornment>
        ),
      }}
      helperText={domain ? `Lookup in domain: ${domain}` : undefined}
    />
  );
};
