import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

type FocusTarget = string | HTMLElement | React.RefObject<HTMLElement>;

interface Announcement {
  id: string;
  message: string;
  mode: 'polite' | 'assertive';
  focusTarget?: FocusTarget;
}

interface AccessibilityContextType {
  announce: (message: string, mode?: 'polite' | 'assertive', focusTarget?: FocusTarget) => void;
  shiftFocus: (target: FocusTarget) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

const DURATION = 3000;
const MAX_QUEUE_SIZE = 5;

export const AccessibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);

  const shiftFocus = useCallback((target: FocusTarget) => {
    // Delay to let the DOM settle before shifting focus
    setTimeout(() => {
      let element: HTMLElement | null = null;
      if (typeof target === 'string') {
        element = document.querySelector(target) as HTMLElement;
      } else if (target && 'current' in target) {
        element = target.current;
      } else {
        element = target as HTMLElement;
      }

      if (element) {
        const prevTabIndex = element.getAttribute('tabindex');
        if (
          !prevTabIndex &&
          element.tabIndex === -1 &&
          element.tagName !== 'INPUT' &&
          element.tagName !== 'BUTTON' &&
          element.tagName !== 'A' &&
          element.tagName !== 'TEXTAREA' &&
          element.tagName !== 'SELECT'
        ) {
          element.setAttribute('tabindex', '-1');
        }
        element.focus();
      }
    }, 50);
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (current) {
      if (current.focusTarget) {
        shiftFocus(current.focusTarget);
      }

      // Clear current announcement after DURATION
      timeout = setTimeout(() => {
        setCurrent(null);
      }, DURATION);
    } else if (queue.length > 0) {
      // Small delay to ensure DOM update is registered by screen readers
      // especially when consecutive messages are identical.
      timeout = setTimeout(() => {
        setCurrent(queue[0]);
        setQueue(q => q.slice(1));
      }, 50);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [current, current ? 0 : queue.length, shiftFocus]);

  const announce = useCallback((message: string, mode: 'polite' | 'assertive' = 'polite', focusTarget?: FocusTarget) => {
    if (!message) return;
    
    setQueue((prevQueue) => {
      const newQueue = [...prevQueue, { id: Date.now() + '-' + Math.random(), message, mode, focusTarget }];
      if (newQueue.length > MAX_QUEUE_SIZE) {
        // Drop oldest pending messages if queue exceeds max size
        return newQueue.slice(newQueue.length - MAX_QUEUE_SIZE);
      }
      return newQueue;
    });
  }, []);

  // Global listener for form submission failures
  useEffect(() => {
    const handleFormSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement;
      if (!form) return;

      const checkErrors = () => {
        const errorSummary = document.querySelector('.RaNotification-error, [role="alert"]') as HTMLElement;
        if (errorSummary) {
          shiftFocus(errorSummary);
          return true;
        }

        const firstInvalid = form.querySelector('[aria-invalid="true"]') as HTMLElement;
        if (firstInvalid) {
          shiftFocus(firstInvalid);
          return true;
        }
        return false;
      };

      // Check shortly after submit (for sync validation errors)
      setTimeout(() => {
        if (!checkErrors()) {
          // Check again later for async validation/server errors
          setTimeout(checkErrors, 500);
          setTimeout(checkErrors, 1000);
        }
      }, 100);
    };

    document.addEventListener('submit', handleFormSubmit, true);

    return () => {
      document.removeEventListener('submit', handleFormSubmit, true);
    };
  }, [shiftFocus]);

  return (
    <AccessibilityContext.Provider value={{ announce, shiftFocus }}>
      {children}
      <div 
        aria-live={current?.mode || 'polite'} 
        aria-atomic="true" 
        style={{ 
          position: 'absolute', 
          width: '1px', 
          height: '1px', 
          padding: 0, 
          margin: '-1px', 
          overflow: 'hidden', 
          clip: 'rect(0, 0, 0, 0)', 
          whiteSpace: 'nowrap', 
          border: 0 
        }}
      >
        {current?.message || ''}
      </div>
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};
