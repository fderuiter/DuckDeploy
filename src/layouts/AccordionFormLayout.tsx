import React, { useState } from 'react';
import { SimpleForm } from 'react-admin';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { LayoutProps } from '../core/LayoutRegistry';

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
  const flatChildren = React.Children.toArray(children);

  if (!sections || sections.length === 0) {
    return (
      <SimpleForm {...rest}>
        {children}
      </SimpleForm>
    );
  }

  const unassignedChildren = [...flatChildren];
  const globalElements: React.ReactNode[] = [];
  
  for (let i = unassignedChildren.length - 1; i >= 0; i--) {
    const c = unassignedChildren[i];
    if (React.isValidElement(c) && !c.props.source) {
      globalElements.unshift(c);
      unassignedChildren.splice(i, 1);
    }
  }

  const [expanded, setExpanded] = useState<string | false>(sections[0]?.label || false);

  const handleExpand = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const renderedSections = sections.map((section, index) => {
    const sectionChildren = section.fields.map((field) => {
      const foundIdx = unassignedChildren.findIndex((c) => React.isValidElement(c) && c.props.source === field);
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

    return (
      <Accordion 
        key={index} 
        expanded={expanded === section.label} 
        onChange={handleExpand(section.label)}
        sx={{ width: '100%', mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">{section.label}</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ display: 'flex', flexDirection: 'column' }}>
          {sectionChildren}
        </AccordionDetails>
      </Accordion>
    );
  });

  const otherChildren = unassignedChildren.filter(c => React.isValidElement(c));
  if (otherChildren.length > 0) {
    renderedSections.push(
      <Accordion 
        key="other"
        expanded={expanded === 'Other'}
        onChange={handleExpand('Other')}
        sx={{ width: '100%', mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Other</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ display: 'flex', flexDirection: 'column' }}>
          {otherChildren}
        </AccordionDetails>
      </Accordion>
    );
  }

  return (
    <SimpleForm {...rest}>
      {renderedSections}
    </SimpleForm>
  );
};
