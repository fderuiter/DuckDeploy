import { TextInput } from 'react-admin';
import SearchIcon from '@mui/icons-material/Search';
import { InputAdornment } from '@mui/material';

export const TerminologyLookupInput = ({ domain, ...props }: any) => {
  return (
    <TextInput
      {...props}
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
