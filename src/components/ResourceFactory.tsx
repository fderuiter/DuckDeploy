import { useEffect, useState } from 'react';
import { Resource } from 'react-admin';
import { useSpec } from '../core/SpecContext';
import type { ResourceDefinition } from '../core/discovery';
import { AutoList } from './AutoList';
import { AutoCreate, AutoEdit } from './AutoForm';
import { setResourceDefinitions } from '../providers/openApiDataProvider';

export const ResourceFactory = () => {
  const { resources: discoveredResources, uiManifest, isLoading, error } = useSpec();
  const [resources, setResources] = useState<ResourceDefinition[]>([]);

  useEffect(() => {
    let active = true;
    if (discoveredResources.length > 0 && !isLoading && !error) {
      const discoveredByName = new Map(discoveredResources.map((r) => [r.name, r]));
      const manifestResources = uiManifest?.resources && typeof uiManifest.resources === 'object'
        ? Object.entries(uiManifest.resources)
        : [];

      const fromManifest = manifestResources
        .map(([resourceName, mapping]) => {
          const discoveredResource = discoveredByName.get(resourceName);
          const listFields = Array.isArray((mapping as { listFields?: unknown }).listFields)
            ? (mapping as { listFields: unknown[] }).listFields
            : [];

          if (!discoveredResource || !discoveredResource.hasList || listFields.length === 0) {
            return null;
          }

          return discoveredResource;
        })
        .filter((resource): resource is ResourceDefinition => Boolean(resource));

      const resourcesForAdmin = fromManifest.length > 0
        ? fromManifest
        : discoveredResources.filter((r) => r.hasList);

      setResourceDefinitions(resourcesForAdmin); // Sync with data provider
      if (active) {
        setResources(resourcesForAdmin);
      }
    }
    return () => { active = false; };
  }, [discoveredResources, uiManifest, isLoading, error]);

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
