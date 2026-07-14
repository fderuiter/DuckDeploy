import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { CustomMapWidget } from '../CustomMapWidget';
import { expect, test, describe, vi } from 'vitest';
import { AdminContext, SimpleForm } from 'react-admin';
import { AccessibilityProvider } from '../../../core/AccessibilityContext';

describe('CustomMapWidget', () => {
  const defaultProps: any = {
    source: 'map_coordinates',
    value: '',
    setValue: vi.fn(),
    schemaNode: { description: 'Map description' },
  };

  test('should not have basic accessibility violations', async () => {
    const { container } = render(
      <AccessibilityProvider>
        <AdminContext>
          <SimpleForm toolbar={false} resource="dummy">
            <CustomMapWidget {...defaultProps} />
          </SimpleForm>
        </AdminContext>
      </AccessibilityProvider>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('markers are accessible to screen readers', () => {
    render(
      <AccessibilityProvider>
        <AdminContext>
          <SimpleForm toolbar={false} resource="dummy">
            <CustomMapWidget {...defaultProps} />
          </SimpleForm>
        </AdminContext>
      </AccessibilityProvider>
    );
    
    // Check that there is at least one marker with an aria-label
    const markers = screen.getAllByLabelText(/Map marker for/i);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]).toBeInTheDocument();
  });

  test('map markers have correct aria-pressed states on interaction', () => {
    render(
      <AccessibilityProvider>
        <AdminContext>
          <SimpleForm toolbar={false} resource="dummy">
            <CustomMapWidget {...defaultProps} />
          </SimpleForm>
        </AdminContext>
      </AccessibilityProvider>
    );

    const markers = screen.getAllByLabelText(/Map marker for/i);
    
    // Initially false
    expect(markers[0]).toHaveAttribute('aria-pressed', 'false');

    // Click marker
    fireEvent.click(markers[0]);

    // Updates to true
    expect(markers[0]).toHaveAttribute('aria-pressed', 'true');
  });

  test('list view applies standard accessibility roles and state attributes', () => {
    render(
      <AccessibilityProvider>
        <AdminContext>
          <SimpleForm toolbar={false} resource="dummy">
            <CustomMapWidget {...defaultProps} />
          </SimpleForm>
        </AdminContext>
      </AccessibilityProvider>
    );

    // Toggle to list view
    const switchControl = screen.getByLabelText(/View as List/i);
    fireEvent.click(switchControl);

    // Listbox role
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    // Option role
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    
    // Initially false
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    // Click option
    fireEvent.click(options[0]);

    // Updates to true
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });
});
