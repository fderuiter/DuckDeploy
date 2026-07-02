import { useEffect, useMemo, useState } from 'react';
import { Admin } from 'react-admin';
import { SpecProvider, useSpec } from './core/SpecContext';
import { duckDeployAuthProvider, setAuthorizationResources } from './core/authProvider';
import { openApiDataProvider, setResourceDefinitions } from './providers/openApiDataProvider';
import {
  ResourceFactory,
  resolveAdminResources,
  resolveOperationMappings,
} from './components/ResourceFactory';
import { WidgetRegistryProvider, registerWidget } from './core/WidgetRegistry';
import { LayoutRegistryProvider, registerLayout } from './core/LayoutRegistry';
import { TabbedFormLayout } from './layouts/TabbedFormLayout';
import { AccordionFormLayout } from './layouts/AccordionFormLayout';
import { AccessibilityProvider } from './core/AccessibilityContext';
import { CustomMapWidget } from './components/custom/CustomMapWidget';
import { TerminologyLookupInput } from './components/custom/TerminologyLookupInput';
import { FetchUserWidget } from './components/custom/FetchUserWidget';
import { BootstrapScreen } from './components/BootstrapScreen';
import { getRuntimeApiConfig } from './core/runtimeConfig';
import { customInstance } from './api/custom-instance';
import type { ResourceDefinition } from './core/discovery';
import { StandardLayout } from './layouts/StandardLayout';

registerWidget('x-ui-custom-map', CustomMapWidget);
registerWidget('cdisc-terminology', TerminologyLookupInput);
registerWidget('fetch-user-widget', FetchUserWidget);

registerLayout('TabbedFormLayout', TabbedFormLayout);
registerLayout('AccordionFormLayout', AccordionFormLayout);

interface BootstrapIssue {
  title: string;
  message: string;
  details?: string[];
}

interface ProxyHealthResponse {
  ok?: boolean;
  code?: string;
  message?: string;
  proxyPrefix?: string;
  upstreamBaseUrl?: string;
}

const runtimeConfig = getRuntimeApiConfig();



const createRuntimeConfigIssue = (): BootstrapIssue => ({
  title: 'API proxy is not configured',
  message: 'DuckDeploy needs a deployed backend proxy before the UI can call CDISC.',
  details: [
    runtimeConfig.message ?? 'Set VITE_API_BASE_URL to the deployed proxy base URL.',
    'Keep CDISC_PRIMARY_KEY and CDISC_SECONDARY_KEY on the proxy host only; do not inject them into the frontend build.',
  ],
});





const createNoResourcesIssue = (): BootstrapIssue => ({
  title: 'No resources were discovered',
  message: 'DuckDeploy loaded the schema and manifest, but no listable resources were available for React-Admin.',
  details: [
    'Verify that ui-manifest.json contains list fields for the desired resources.',
    'If the OpenAPI contract changed, regenerate the manifest with `npm run generate` and rebuild the app.',
  ],
});

const AdminApp = () => {
  const { spec, uiManifest, isLoading, error } = useSpec();
  const [proxyIssue, setProxyIssue] = useState<BootstrapIssue | null>(
    runtimeConfig.apiBaseUrl ? null : createRuntimeConfigIssue(),
  );
  const [isProxyLoading, setIsProxyLoading] = useState(Boolean(runtimeConfig.healthUrl));

  console.log('AdminApp render', { isLoading, isProxyLoading, hasError: !!error, hasProxyIssue: !!proxyIssue });

  const resources = useMemo<ResourceDefinition[]>(
    () => {
      const res = spec ? resolveAdminResources(spec, uiManifest) : [];
      console.log('Resolved resources:', res.length);
      return res;
    },
    [spec, uiManifest],
  );
  const operationMappings = useMemo(
    () => resolveOperationMappings(uiManifest),
    [uiManifest],
  );

  useEffect(() => {
    setResourceDefinitions(resources, operationMappings);
    setAuthorizationResources(resources);
  }, [resources, operationMappings]);

  useEffect(() => {
    const controller = new AbortController();
    const healthUrl = runtimeConfig.healthUrl;
    if (!healthUrl) {
      setIsProxyLoading(false);
      return () => {
        controller.abort();
      };
    }

    const loadProxyHealth = async () => {
      setIsProxyLoading(true);

      try {
        await customInstance<ProxyHealthResponse>({
          url: healthUrl,
          method: 'GET',
          headers: { Accept: 'application/json' }
        }, { signal: controller.signal });

        setProxyIssue(null);
            } catch (issue) {
        if (controller.signal.aborted) {
          return;
        }

        if (
          typeof issue === 'object' &&
          issue !== null &&
          'title' in issue &&
          'message' in issue
        ) {
          setProxyIssue(issue as BootstrapIssue);
        } else {
          setProxyIssue({
            title: 'API proxy is unreachable',
            message: 'DuckDeploy could not reach the configured backend proxy.',
            details: [String(issue)]
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsProxyLoading(false);
        }
      }
    };

    loadProxyHealth();

    return () => {
      controller.abort();
    };
  }, []);

  if (isLoading || isProxyLoading) {
    return (
      <BootstrapScreen
        title="Starting DuckDeploy"
        message="Loading the compiled schema, UI manifest, and backend proxy configuration."
        details={[
          `API base: ${runtimeConfig.apiBaseUrl ?? 'not configured'}`,
          'CDISC secrets stay on the proxy backend; the frontend only talks to that proxy.',
        ]}
        loading
      />
    );
  }

    if (error) {
    const issue = (error as any).title ? (error as BootstrapIssue) : {
      title: 'Application bootstrap failed',
      message: 'DuckDeploy could not load the compiled schema or UI manifest required to start.',
      details: [error.message],
    };
    return <BootstrapScreen title={issue.title} message={issue.message} details={issue.details} />;
  }

  if (proxyIssue) {
    return <BootstrapScreen title={proxyIssue.title} message={proxyIssue.message} details={proxyIssue.details} />;
  }

  if (resources.length === 0) {
    const issue = createNoResourcesIssue();
    return <BootstrapScreen title={issue.title} message={issue.message} details={issue.details} />;
  }

  return (
    <Admin authProvider={duckDeployAuthProvider} dataProvider={openApiDataProvider} layout={StandardLayout}>
      {() => ResourceFactory({ resources }).props.children}
    </Admin>
  );
};

/**
 * Generated description.
 *
 */
const App = () => (
  <AccessibilityProvider>
    <LayoutRegistryProvider>
      <WidgetRegistryProvider>
        <SpecProvider>
          <AdminApp />
        </SpecProvider>
      </WidgetRegistryProvider>
    </LayoutRegistryProvider>
  </AccessibilityProvider>
);

export default App;
