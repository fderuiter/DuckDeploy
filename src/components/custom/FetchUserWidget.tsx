import React from 'react';
import { Button, CircularProgress } from '@mui/material';
import { useWidgetMutation } from '../../core/WidgetRegistry';
import type { EngineContext } from '../../core/WidgetRegistry';

export const FetchUserWidget: React.FC<EngineContext> = (props) => {
  const { execute, isLoading, error } = useWidgetMutation(props.mutate, {
    onSuccess: (data) => {
      // Use the backward compatible setValue pattern to update the field
      props.setValue(data.data.username);
    },
    onError: (err) => {
      console.error('Failed to fetch user:', err);
    }
  });

  const handleClick = () => {
    // Trigger a side effect using the data provider's getOne operation
    execute('getOne', { resource: 'users', id: 123 });
  };

  return (
    <div>
      <Button 
        variant="contained" 
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? <CircularProgress size={24} /> : 'Fetch User Data'}
      </Button>
      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
      <div style={{ marginTop: '10px' }}>
        Current Value: {props.value as string}
      </div>
    </div>
  );
};
