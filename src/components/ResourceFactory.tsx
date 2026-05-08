import { useEffect, useState } from 'react';
import { Resource } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import { discoverResources, type ResourceDefinition } from '../core/discovery';
import { AutoList } from './AutoList';
import { AutoCreate, AutoEdit } from './AutoForm';
import { setResourceDefinitions } from '../providers/openApiDataProvider';

export const ResourceFactory = () => {
  const { spec, isLoading, error } = useSpec();
  const [resources, setResources] = useState<ResourceDefinition[]>([]);

  useEffect(() => {
    let active = true;
    if (spec && !isLoading && !error) {
      const discovered = discoverResources(spec);
      setResourceDefinitions(discovered); // Sync with data provider
      if (active) {
        setResources(discovered);
      }
    }
    return () => { active = false; };
  }, [spec, isLoading, error]);

  if (isLoading) {
    return null; // Return null so React-Admin doesn't render until ready (handled higher up ideally)
  }

  if (error) {
    return <div>Error loading API Specification: {error.message}</div>;
  }

  return (
    <>
      {resources.map((resource) => (
        <Resource
          key={resource.name}
          name={resource.name}
          list={resource.hasList ? AutoList : undefined}
          create={resource.hasCreate ? AutoCreate : undefined}
          edit={resource.hasEdit ? AutoEdit : undefined}
        />
      ))}
    </>
  );
};
