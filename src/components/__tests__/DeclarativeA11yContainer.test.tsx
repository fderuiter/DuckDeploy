import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { DeclarativeA11yContainer } from '../DeclarativeA11yContainer';
import { AccessibilityProvider } from '../../core/AccessibilityContext';

const TestComponent = () => {
  const [dependency, setDependency] = useState(0);

  return (
    <AccessibilityProvider>
      <div>
        <button onClick={() => setDependency(prev => prev + 1)}>Change Content</button>
        <DeclarativeA11yContainer dependency={dependency} announcement="Changed!">
          {dependency % 2 === 0 ? (
            <div>
              <p>Even state</p>
              <input type="text" data-testid="even-input" />
            </div>
          ) : (
            <div>
              <p>Odd state</p>
              <input type="text" data-testid="odd-input" />
            </div>
          )}
        </DeclarativeA11yContainer>
      </div>
    </AccessibilityProvider>
  );
};

describe('DeclarativeA11yContainer', () => {
  it('moves focus to the newly rendered input when dependency changes and user interacted', async () => {
    render(<TestComponent />);

    const button = screen.getByText('Change Content');
    const evenInput = screen.getByTestId('even-input');
    
    // Simulate user focusing inside the container before the change
    evenInput.focus();
    fireEvent.focusIn(evenInput);
    
    expect(screen.queryByTestId('odd-input')).not.toBeInTheDocument();

    // Click to change dependency
    fireEvent.click(button);

    // After state change, focus should shift to the new input in the container
    await waitFor(() => {
      const oddInput = screen.getByTestId('odd-input');
      expect(document.activeElement).toBe(oddInput);
    });
  });
});
