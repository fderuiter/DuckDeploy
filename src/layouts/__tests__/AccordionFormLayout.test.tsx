import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { expect, test, describe } from 'vitest';
import { AdminContext } from 'react-admin';
import { FormProvider, useForm } from 'react-hook-form';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AccordionFormLayout } from '../AccordionFormLayout';
import { AccessibilityProvider } from '../../core/AccessibilityContext';

const theme = createTheme();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const methods = useForm();
  return (
    <ThemeProvider theme={theme}>
      <AccessibilityProvider>
        <AdminContext theme={theme as any}>
          <FormProvider {...methods}>
            <h1>Form Container</h1>
            <h2>Section Details</h2>
            {children}
          </FormProvider>
        </AdminContext>
      </AccessibilityProvider>
    </ThemeProvider>
  );
};

describe('AccordionFormLayout', () => {
  const layoutConfig = {
    sections: [
      { label: 'General', fields: ['name'] },
      { label: 'Advanced', fields: ['status'] },
    ],
  };

  test('accordion sections have correct ARIA controls and accessible relationships', async () => {
    const { container } = render(
      <TestWrapper>
        <AccordionFormLayout layoutConfig={layoutConfig} resource="dummy" toolbar={false}>
          <div data-source="name">Name Input</div>
          <div data-source="status">Status Input</div>
        </AccordionFormLayout>
      </TestWrapper>
    );

    // Initial accessibility check
    expect(await axe(container)).toHaveNoViolations();

    const generalHeader = screen.getByRole('button', { name: /General/i });
    const advancedHeader = screen.getByRole('button', { name: /Advanced/i });

    expect(generalHeader).toHaveAttribute('aria-controls');
    expect(generalHeader).toHaveAttribute('id');

    const generalPanelId = generalHeader.getAttribute('aria-controls');
    const generalPanel = container.querySelector(`#${generalPanelId}`);
    expect(generalPanel).toBeInTheDocument();

    // Verify interaction
    fireEvent.click(advancedHeader);

    // Check accessibility after interaction
    expect(await axe(container)).toHaveNoViolations();
  });
});
