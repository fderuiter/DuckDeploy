import { Resource } from 'react-admin';
import { AutoList } from './AutoList';
import { AutoCreate, AutoEdit } from './AutoForm';

export const resolveAdminResources = (_spec: unknown, uiManifest: unknown): any[] => {
  const manifestResourceMap =
    uiManifest &&
    typeof uiManifest === 'object' &&
    (uiManifest as { resources?: unknown }).resources &&
    typeof (uiManifest as { resources?: unknown }).resources === 'object'
      ? ((uiManifest as { resources: Record<string, unknown> }).resources)
      : null;
  const manifestResources = manifestResourceMap ? Object.values(manifestResourceMap) : [];

  return manifestResources.filter((resource: any) => resource && resource.hasList);
};

export const resolveOperationMappings = (
  uiManifest: unknown,
): Record<string, { functionName: string; modulePath: string }> =>
  uiManifest &&
  typeof uiManifest === 'object' &&
  (uiManifest as { operationFunctionMap?: unknown }).operationFunctionMap &&
  typeof (uiManifest as { operationFunctionMap?: unknown }).operationFunctionMap === 'object'
    ? (uiManifest as { operationFunctionMap: Record<string, { functionName: string; modulePath: string }> })
        .operationFunctionMap
    : {};

export const ResourceFactory = ({ resources }: { resources: any[] }) => {
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
