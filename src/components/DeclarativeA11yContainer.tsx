import React, { useEffect, useRef, useState } from 'react';
import { useAccessibility } from '../core/AccessibilityContext';

export interface DeclarativeA11yContainerProps {
  children: React.ReactNode;
  dependency: any;
  focusTarget?: 'first-input' | 'heading' | 'container' | string;
  announcement?: string;
  className?: string;
}

/**
 * Declarative container that automatically shifts focus when its dependent content changes.
 * Used primarily for polymorphic schema transitions to maintain accessibility focus context.
 */
export const DeclarativeA11yContainer: React.FC<DeclarativeA11yContainerProps> = ({
  children,
  dependency,
  focusTarget = 'first-input',
  announcement,
  className,
}) => {
  const { announce, shiftFocus } = useAccessibility();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevDependencyRef = useRef(dependency);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const handleInteraction = () => setIsInteracting(true);
    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousedown', handleInteraction);
      container.addEventListener('keydown', handleInteraction);
      container.addEventListener('focusin', handleInteraction);
    }
    return () => {
      if (container) {
        container.removeEventListener('mousedown', handleInteraction);
        container.removeEventListener('keydown', handleInteraction);
        container.removeEventListener('focusin', handleInteraction);
      }
    };
  }, []);

  useEffect(() => {
    if (prevDependencyRef.current !== dependency) {
      prevDependencyRef.current = dependency;

      // Only shift focus if user has been interacting with this container
      if (isInteracting || (containerRef.current && containerRef.current.contains(document.activeElement))) {
        if (announcement) {
          announce(announcement, 'polite');
        }

        // Delay to allow DOM stabilization (handled partially by shiftFocus, but we find the element here)
        setTimeout(() => {
          if (!containerRef.current) return;

          let targetElement: HTMLElement | null;
          if (focusTarget === 'first-input') {
            targetElement = containerRef.current.querySelector(
              'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
            ) as HTMLElement;
          } else if (focusTarget === 'heading') {
            targetElement = containerRef.current.querySelector('h1, h2, h3, h4, h5, h6') as HTMLElement;
          } else if (focusTarget === 'container') {
            targetElement = containerRef.current;
          } else {
            targetElement = containerRef.current.querySelector(focusTarget) as HTMLElement;
          }

          if (targetElement) {
            shiftFocus(targetElement);
          } else {
            // Fallback to container if no target found
            shiftFocus(containerRef.current);
          }
        }, 0); // let React render children
      }
      
      // Reset interaction state after transition
      setIsInteracting(false);
    }
  }, [dependency, focusTarget, announcement, announce, shiftFocus, isInteracting]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};
