import React, { useState } from 'react';
import { SimpleForm } from 'react-admin';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { LayoutProps } from '../core/LayoutRegistry';
import { useLayoutOrchestrator } from './useLayoutOrchestrator';

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
export const AccordionFormLayout: React.FC<LayoutProps> = ({ children, layoutConfig, resourceName, isCreate, ...rest }) => {
  const sections = (layoutConfig?.sections as Array<{ label: string; fields: string[] }>) || [];

  const orchestratedSections = useLayoutOrchestrator(children, sections);

  const [expanded, setExpanded] = useState<string | false>(sections[0]?.label || false);

  const handleExpand = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  if (!orchestratedSections) {
    return (
      <SimpleForm {...rest}>
        {children}
      </SimpleForm>
    );
  }

  return (
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
  );
};
