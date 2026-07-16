import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { TerminologyLookupInput } from '../TerminologyLookupInput';
import { expect, test, describe, vi } from 'vitest';

describe('TerminologyLookupInput', () => {
  const defaultProps: any = {
    source: 'terminology',
    value: '',
    setValue: vi.fn(),
    widgetProps: { domain: 'AE' },
    schemaNode: { title: 'Dynamic Search Label', description: 'Dynamic Helper Text' },
  };

  test('should not have basic accessibility violations', async () => {
    const { container } = render(<TerminologyLookupInput {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('verifies search results and keyboard selection logic', async () => {
    const setValueMock = vi.fn();
    const { container } = render(<TerminologyLookupInput {...defaultProps} setValue={setValueMock} />);
    
    const input = screen.getByRole('combobox', { name: /Dynamic Search Label/i });
    expect(screen.getAllByText('Dynamic Helper Text').length).toBeGreaterThan(0);
    
    // Type to search
    await userEvent.type(input, 'Adverse');
    
    // Wait for the options to appear
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toBeInTheDocument();
    
    // Check accessibility in dynamic state
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Use keyboard navigation to select the second option
    await userEvent.keyboard('{ArrowDown}'); // Select 'Adverse Event 1'
    await userEvent.keyboard('{ArrowDown}'); // Select 'Adverse Event 2'
    await userEvent.keyboard('{Enter}');
    
    expect(setValueMock).toHaveBeenCalledWith('Adverse Event 2');
  });
});
