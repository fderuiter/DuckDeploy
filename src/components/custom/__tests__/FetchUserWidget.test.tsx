import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FetchUserWidget } from '../FetchUserWidget';
import type { EngineContext } from '../../../core/WidgetRegistry';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('FetchUserWidget', () => {
  it('successfully fetches data and sets value', async () => {
    const mockSetValue = vi.fn();
    const mockMutate = vi.fn().mockResolvedValue({
      data: { username: 'test_user_from_api' }
    });

    const mockProps = {
      record: {},
      schemaNode: {} as any,
      source: 'testSource',
      value: 'initial_value',
      widgetProps: {},
      setValue: mockSetValue,
      mutate: mockMutate,
    } as EngineContext;

    render(<FetchUserWidget {...mockProps} />);

    // Check initial value
    expect(screen.getByText('Current Value: initial_value')).toBeInTheDocument();

    // Find and click the button
    const button = screen.getByRole('button', { name: /fetch user data/i });
    fireEvent.click(button);

    // Verify loading state
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Verify mutate was called
    expect(mockMutate).toHaveBeenCalledWith('getOne', { resource: 'users', id: 123 });

    // Wait for the mutation to resolve and setValue to be called
    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('test_user_from_api');
    });
  });
});
