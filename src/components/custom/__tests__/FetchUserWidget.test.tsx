/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FetchUserWidget } from '../FetchUserWidget';
import { WidgetMutationContext, type WidgetValueProps } from '../../../core/WidgetRegistry';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('FetchUserWidget', () => {
  it('successfully fetches data and sets value', async () => {
    const mockSetValue = vi.fn();
    const mockMutate = vi.fn().mockResolvedValue({
      data: { username: 'test_user_from_api' }
    });

    const mockProps: WidgetValueProps = {
      source: 'testSource',
      value: 'initial_value',
      setValue: mockSetValue,
    };

    render(
      <WidgetMutationContext.Provider value={{ mutate: mockMutate }}>
        <FetchUserWidget {...mockProps} />
      </WidgetMutationContext.Provider>
    );

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
