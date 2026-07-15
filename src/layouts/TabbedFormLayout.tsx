import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TabbedForm } from 'react-admin';
import { useFormContext } from 'react-hook-form';
import type { LayoutProps } from '../core/LayoutRegistry';
import { useLayoutOrchestrator } from './useLayoutOrchestrator';
import { FormLayoutContext } from './FormLayoutContext';
import { useAccessibility } from '../core/AccessibilityContext';

/**
 * A custom layout that uses React Admin's TabbedForm.
 *
 * layoutConfig format:
 * {
 *   tabs: [
 *     { label: "General", fields: ["name", "description"] },
 *     { label: "Settings", fields: ["isActive", "status"] }
 *   ]
 * }
 */
export const TabbedFormLayout: React.FC<LayoutProps> = ({ children, layoutConfig, ...rest }) => {
  const tabs = useMemo(() => (layoutConfig?.tabs as Array<{ label: string; fields: string[] }>) || [], [layoutConfig?.tabs]);

  const orchestratedTabs = useLayoutOrchestrator(children, tabs);

  const [activeTab, setActiveTab] = useState<number>(0);
  const { formState: { errors, submitCount } } = useFormContext();
  const lastSubmitCount = useRef(submitCount);

  const { shiftFocus } = useAccessibility();

  const getTabIndexForField = useCallback((fieldSource: string): number | null => {
    if (!orchestratedTabs) return null;
    const tabIndex = tabs.findIndex(t => t.fields.includes(fieldSource));
    if (tabIndex !== -1) return tabIndex;
    
    const otherIndex = orchestratedTabs.findIndex(t => t.label === 'Other');
    if (otherIndex !== -1) return otherIndex;
    
    return null;
  }, [tabs, orchestratedTabs]);

  const revealField = useCallback((fieldSource: string): Promise<void> => {
    return new Promise((resolve) => {
      const tabIndex = getTabIndexForField(fieldSource);
      if (tabIndex !== null && activeTab !== tabIndex) {
        setActiveTab(tabIndex);
        requestAnimationFrame(() => {
          setTimeout(() => resolve(), 50);
        });
      } else {
        resolve();
      }
    });
  }, [getTabIndexForField, activeTab]);

  useEffect(() => {
    if (submitCount > lastSubmitCount.current) {
      lastSubmitCount.current = submitCount;
      
      const flattenErrors = (obj: any, prefix = ''): string[] => {
        let result: string[] = [];
        if (!obj) return result;
        for (const [key, value] of Object.entries(obj)) {
          const newPrefix = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === 'object' && (value as any).message) {
            result.push(newPrefix);
          } else if (value && typeof value === 'object') {
            result = result.concat(flattenErrors(value, newPrefix));
          }
        }
        return result;
      };

      const flatErrorKeys = flattenErrors(errors);

      if (flatErrorKeys.length > 0) {
        const firstErrorField = flatErrorKeys[0];
        const tabIndex = getTabIndexForField(firstErrorField);
        let willExpand = false;
        
        if (tabIndex !== null && activeTab !== tabIndex) {
          setActiveTab(tabIndex);
          willExpand = true;
        }

        setTimeout(() => {
          const input = document.querySelector(`[name="${firstErrorField}"], [id="${firstErrorField}"]`) as HTMLElement;
          if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            shiftFocus(input);
          }
        }, willExpand ? 100 : 0);
      }
    }
  }, [submitCount, errors, activeTab, shiftFocus, getTabIndexForField]);

  const handleTabChange = (_event: React.ChangeEvent<unknown>, value: any) => {
    // value could be a number (index) or string (if react-admin passes path)
    // we assume it is the index
    if (typeof value === 'number') {
      setActiveTab(value);
    } else if (typeof value === 'string' && !isNaN(parseInt(value, 10))) {
      setActiveTab(parseInt(value, 10));
    }
  };

  // If no tabs configuration is provided, fallback to standard TabbedForm with a default tab
  if (!orchestratedTabs) {
    return (
      <FormLayoutContext.Provider value={{ revealField: () => Promise.resolve() }}>
        <TabbedForm {...rest}>
          <TabbedForm.Tab label="General">{children}</TabbedForm.Tab>
        </TabbedForm>
      </FormLayoutContext.Provider>
    );
  }

  return (
    <FormLayoutContext.Provider value={{ revealField }}>
      <TabbedForm 
        {...rest}
        syncWithLocation={false}
        onChange={handleTabChange as any}
        {...({ value: activeTab } as any)}
      >
        {/* React Admin's TabbedForm needs an implicit tabs object or we can pass props directly.
            If onChange doesn't work directly on TabbedForm, it's typically passed via the tabs prop.
            But the context specifically says: "passing syncWithLocation={false}, value={activeTab} (state), and onChange={handleTabChange}"
        */}
        {orchestratedTabs.map((tab, index) => (
          <TabbedForm.Tab 
            key={tab.label === 'Other' ? 'other' : index} 
            label={tab.label}
            value={index} // react-admin TabbedForm.Tab expects value when syncWithLocation is false
          >
            {tab.elements}
          </TabbedForm.Tab>
        ))}
      </TabbedForm>
    </FormLayoutContext.Provider>
  );
};
