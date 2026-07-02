import React, { ReactNode } from 'react';
import { TabbedForm } from 'react-admin';
import type { LayoutProps } from '../core/LayoutRegistry';
import { useLayoutOrchestrator } from './useLayoutOrchestrator';

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
export const TabbedFormLayout: React.FC<LayoutProps> = ({ children, layoutConfig, resourceName, isCreate, ...rest }) => {
  const tabs = (layoutConfig?.tabs as Array<{ label: string; fields: string[] }>) || [];

  const orchestratedTabs = useLayoutOrchestrator(children, tabs);

  // If no tabs configuration is provided, fallback to standard TabbedForm with a default tab
  if (!orchestratedTabs) {
    return (
      <TabbedForm {...rest}>
        <TabbedForm.Tab label="General">{children}</TabbedForm.Tab>
      </TabbedForm>
    );
  }

  return (
    <TabbedForm {...rest}>
      {orchestratedTabs.map((tab, index) => (
        <TabbedForm.Tab key={tab.label === 'Other' ? 'other' : index} label={tab.label}>
          {tab.elements}
        </TabbedForm.Tab>
      ))}
    </TabbedForm>
  );
};
