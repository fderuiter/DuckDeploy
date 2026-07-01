import React, { ReactNode } from 'react';
import { TabbedForm } from 'react-admin';
import type { LayoutProps } from '../core/LayoutRegistry';

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
  const flatChildren = React.Children.toArray(children);

  // If no tabs configuration is provided, fallback to standard TabbedForm with a default tab
  if (!tabs || tabs.length === 0) {
    return (
      <TabbedForm {...rest}>
        <TabbedForm.Tab label="General">{children}</TabbedForm.Tab>
      </TabbedForm>
    );
  }

  const unassignedChildren = [...flatChildren];

  // Extract non-field components (like SchemaErrorSummary) to put them in the first tab
  const globalElements: React.ReactNode[] = [];
  for (let i = unassignedChildren.length - 1; i >= 0; i--) {
    const c = unassignedChildren[i];
    if (React.isValidElement(c) && !c.props.source) {
      globalElements.unshift(c);
      unassignedChildren.splice(i, 1);
    }
  }

  const renderedTabs = tabs.map((tab, index) => {
    const tabChildren = tab.fields.map((field) => {
      const foundIdx = unassignedChildren.findIndex((c) => React.isValidElement(c) && c.props.source === field);
      if (foundIdx >= 0) {
        const found = unassignedChildren[foundIdx];
        unassignedChildren.splice(foundIdx, 1);
        return found;
      }
      return null;
    }).filter(Boolean);

    // Inject global elements at the top of the first tab
    if (index === 0 && globalElements.length > 0) {
      tabChildren.unshift(...globalElements);
    }

    return (
      <TabbedForm.Tab key={index} label={tab.label}>
        {tabChildren}
      </TabbedForm.Tab>
    );
  });

  const otherChildren = unassignedChildren.filter(c => React.isValidElement(c));
  if (otherChildren.length > 0) {
    // If there were global elements but no explicit tabs were created somehow? Handled by initial check
    renderedTabs.push(
      <TabbedForm.Tab key="other" label="Other">
        {otherChildren}
      </TabbedForm.Tab>
    );
  }

  return (
    <TabbedForm {...rest}>
      {renderedTabs}
    </TabbedForm>
  );
};
