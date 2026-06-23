import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { CustomMapWidget } from '../CustomMapWidget';
import { expect, test, describe, vi } from 'vitest';
import { AdminContext, SimpleForm } from 'react-admin';

describe('CustomMapWidget', () => {
  const defaultProps: any = {
    source: 'map_coordinates',
    value: '',
    setValue: vi.fn(),
    schemaNode: { description: 'Map description' },
  };

  test('should not have basic accessibility violations', async () => {
    const { container } = render(
      <AdminContext>
        <SimpleForm toolbar={false} resource="dummy">
          <CustomMapWidget {...defaultProps} />
        </SimpleForm>
      </AdminContext>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('markers are accessible to screen readers', () => {
    render(
      <AdminContext>
        <SimpleForm toolbar={false} resource="dummy">
          <CustomMapWidget {...defaultProps} />
        </SimpleForm>
      </AdminContext>
    );
    
    // Check that there is at least one marker with an aria-label
    const markers = screen.getAllByLabelText(/Map marker for/i);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]).toBeInTheDocument();
  });
});
