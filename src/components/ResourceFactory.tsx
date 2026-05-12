import { Resource } from 'react-admin';
import { discoverResources, type ResourceDefinition } from '../core/discovery';
import { AutoList } from './AutoList';
import { AutoCreate, AutoEdit } from './AutoForm';

export const resolveAdminResources = (spec: unknown, uiManifest: unknown): ResourceDefinition[] => {
  const discovered = discoverResources(spec);
  const discoveredByName = new Map(discovered.map((resourceDefinition) => [resourceDefinition.name, resourceDefinition]));
  const manifestResourceMap =
    uiManifest &&
    typeof uiManifest === 'object' &&
    (uiManifest as { resources?: unknown }).resources &&
    typeof (uiManifest as { resources?: unknown }).resources === 'object'
      ? ((uiManifest as { resources: Record<string, unknown> }).resources)
      : null;
  const manifestResources = manifestResourceMap ? Object.entries(manifestResourceMap) : [];

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

  return fromManifest.length > 0
    ? fromManifest
    : discovered.filter((resourceDefinition) => resourceDefinition.hasList);
};

export const resolveOperationMappings = (uiManifest: unknown): Record<string, string> =>
  uiManifest && typeof uiManifest === 'object' && (uiManifest as { operationFunctionMap?: unknown }).operationFunctionMap && typeof (uiManifest as { operationFunctionMap?: unknown }).operationFunctionMap === 'object'
    ? ((uiManifest as { operationFunctionMap: Record<string, string> }).operationFunctionMap)
    : {};

export const ResourceFactory = ({ resources }: { resources: ResourceDefinition[] }) => {
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
