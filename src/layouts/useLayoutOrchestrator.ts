import React, { useMemo } from 'react';

export type SectionConfig = {
  label: string;
  fields: string[];
};

export type OrchestratedSection = {
  label: string;
  elements: React.ReactNode[];
};

export const useLayoutOrchestrator = (
  children: React.ReactNode,
  sectionsConfig: SectionConfig[] | undefined
): OrchestratedSection[] | null => {
  return useMemo(() => {
    if (!sectionsConfig || sectionsConfig.length === 0) {
      return null;
    }

    const flatChildren = React.Children.toArray(children);
    const unassignedChildren = [...flatChildren];
    const globalElements: React.ReactNode[] = [];
    
    for (let i = unassignedChildren.length - 1; i >= 0; i--) {
      const c = unassignedChildren[i];
      if (React.isValidElement(c) && !c.props.source) {
        globalElements.unshift(c);
        unassignedChildren.splice(i, 1);
      }
    }

    const orchestratedSections = sectionsConfig.map((section, index) => {
      const sectionChildren = section.fields.map((field) => {
        const foundIdx = unassignedChildren.findIndex(
          (c) => React.isValidElement(c) && (c.props as any).source === field
        );
        if (foundIdx >= 0) {
          const found = unassignedChildren[foundIdx];
          unassignedChildren.splice(foundIdx, 1);
          return found;
        }
        return null;
      }).filter(Boolean);

      if (index === 0 && globalElements.length > 0) {
        sectionChildren.unshift(...globalElements);
      }

      return {
        label: section.label,
        elements: sectionChildren
      };
    });

    const otherChildren = unassignedChildren.filter(c => React.isValidElement(c));
    if (otherChildren.length > 0) {
      // If there are leftover children, put them in "Other"
      orchestratedSections.push({
        label: 'Other',
        elements: otherChildren
      });
    }

    return orchestratedSections;
  }, [children, sectionsConfig]);
};
