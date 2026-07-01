import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';

interface Announcement {
  id: string;
  message: string;
  mode: 'polite' | 'assertive';
}

interface AccessibilityContextType {
  announce: (message: string, mode?: 'polite' | 'assertive') => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

const DURATION = 3000;
const MAX_QUEUE_SIZE = 5;

export const AccessibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (current) {
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
  }, [current, current ? 0 : queue.length]);

  const announce = useCallback((message: string, mode: 'polite' | 'assertive' = 'polite') => {
    if (!message) return;
    
    setQueue((prevQueue) => {
      const newQueue = [...prevQueue, { id: Date.now() + '-' + Math.random(), message, mode }];
      if (newQueue.length > MAX_QUEUE_SIZE) {
        // Drop oldest pending messages if queue exceeds max size
        return newQueue.slice(newQueue.length - MAX_QUEUE_SIZE);
      }
      return newQueue;
    });
  }, []);

  return (
    <AccessibilityContext.Provider value={{ announce }}>
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
