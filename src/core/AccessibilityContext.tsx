import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

interface AccessibilityContextType {
  announce: (message: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [announcement, setAnnouncement] = useState<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setAnnouncement('');
    }, 3000);
  }, []);

  return (
    <AccessibilityContext.Provider value={{ announce }}>
      {children}
      <div 
        aria-live="polite" 
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
        {announcement}
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
