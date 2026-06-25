import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

interface AccessibilityContextType {
  announce: (message: string, mode?: 'polite' | 'assertive') => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [announcement, setAnnouncement] = useState<{ message: string, mode: 'polite' | 'assertive' }>({ message: '', mode: 'polite' });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const announce = useCallback((message: string, mode: 'polite' | 'assertive' = 'polite') => {
    setAnnouncement({ message, mode });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setAnnouncement({ message: '', mode: 'polite' });
    }, 3000);
  }, []);

  return (
    <AccessibilityContext.Provider value={{ announce }}>
      {children}
      <div 
        aria-live={announcement.mode} 
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
        {announcement.message}
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
