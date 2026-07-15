import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SimpleForm } from 'react-admin';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useFormContext } from 'react-hook-form';
import type { LayoutProps } from '../core/LayoutRegistry';
import { useLayoutOrchestrator } from './useLayoutOrchestrator';
import { FormLayoutContext } from './FormLayoutContext';
import { useAccessibility } from '../core/AccessibilityContext';

/**
 * A custom layout that places sections of a form inside MUI Accordions.
 *
 * layoutConfig format:
 * {
 *   sections: [
 *     { label: "General", fields: ["name", "description"] },
 *     { label: "Advanced", fields: ["status", "metadata"] }
 *   ]
 * }
 */
export const AccordionFormLayout: React.FC<LayoutProps> = ({ children, layoutConfig, ...rest }) => {
  const sections = useMemo(() => (layoutConfig?.sections as Array<{ label: string; fields: string[] }>) || [], [layoutConfig?.sections]);

  const orchestratedSections = useLayoutOrchestrator(children, sections);

  const [expanded, setExpanded] = useState<string | false>(sections[0]?.label || false);
  const { formState: { errors, submitCount } } = useFormContext();
  const { shiftFocus } = useAccessibility();
  const lastSubmitCount = useRef(submitCount);

  const getSectionForField = useCallback((fieldSource: string) => {
    const section = sections.find(s => s.fields.includes(fieldSource));
    if (section) return section.label;
    if (orchestratedSections?.find(s => s.label === 'Other')) return 'Other';
    return null;
  }, [sections, orchestratedSections]);

  const revealField = useCallback((fieldSource: string): Promise<void> => {
    return new Promise((resolve) => {
      const sectionLabel = getSectionForField(fieldSource);
      if (sectionLabel && expanded !== sectionLabel) {
        setExpanded(sectionLabel);
        requestAnimationFrame(() => {
          setTimeout(() => resolve(), 50);
        });
      } else {
        resolve();
      }
    });
  }, [getSectionForField, expanded]);

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
        // Find first invalid field
        const firstErrorField = flatErrorKeys[0];
        const sectionLabel = getSectionForField(firstErrorField);
        let willExpand = false;
        
        if (sectionLabel && expanded !== sectionLabel) {
          setExpanded(sectionLabel);
          willExpand = true;
        }
        
        // Wait for DOM to render the expanded section, then focus the field
        setTimeout(() => {
          const input = document.querySelector(`[name="${firstErrorField}"], [id="${firstErrorField}"]`) as HTMLElement;
          if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            shiftFocus(input);
          }
        }, willExpand ? 100 : 0);
      }
    }
  }, [submitCount, errors, expanded, shiftFocus, getSectionForField]);

  const handleExpand = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  if (!orchestratedSections) {
    return (
      <FormLayoutContext.Provider value={{ revealField: () => Promise.resolve() }}>
        <SimpleForm {...rest}>
          {children}
        </SimpleForm>
      </FormLayoutContext.Provider>
    );
  }

  return (
    <FormLayoutContext.Provider value={{ revealField }}>
      <SimpleForm {...rest}>
        {orchestratedSections.map((section, index) => (
          <Accordion 
            key={section.label === 'Other' ? 'other' : index}
            expanded={expanded === section.label} 
            onChange={handleExpand(section.label)}
            sx={{ width: '100%', mb: 1 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">{section.label}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ display: 'flex', flexDirection: 'column' }}>
              {section.elements}
            </AccordionDetails>
          </Accordion>
        ))}
      </SimpleForm>
    </FormLayoutContext.Provider>
  );
};
