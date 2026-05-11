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
import { CustomMapWidget } from './components/custom/CustomMapWidget';
import { TerminologyLookupInput } from './components/custom/TerminologyLookupInput';
import { BootstrapScreen } from './components/BootstrapScreen';
import { getRuntimeApiConfig } from './core/runtimeConfig';
import type { ResourceDefinition } from './core/discovery';

registerWidget('x-ui-custom-map', CustomMapWidget);
registerWidget('cdisc-terminology', TerminologyLookupInput);

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

const createSpecIssue = (error: Error): BootstrapIssue => ({
  title: 'Application bootstrap failed',
  message: 'DuckDeploy could not load the compiled schema or UI manifest required to start.',
  details: [error.message],
});

const createRuntimeConfigIssue = (): BootstrapIssue => ({
  title: 'API proxy is not configured',
  message: 'DuckDeploy needs a deployed backend proxy before the UI can call CDISC.',
  details: [
    runtimeConfig.message ?? 'Set VITE_API_BASE_URL to the deployed proxy base URL.',
    'Keep CDISC_PRIMARY_KEY and CDISC_SECONDARY_KEY on the proxy host only; do not inject them into the frontend build.',
  ],
});

const createProxyHealthIssue = (status: number, payload: ProxyHealthResponse | null, fallbackMessage: string): BootstrapIssue => {
  if (payload?.code === 'PROXY_MISSING_API_KEY') {
    return {
      title: 'Proxy is missing CDISC credentials',
      message: payload.message ?? fallbackMessage,
      details: [
        'Set CDISC_PRIMARY_KEY and/or CDISC_SECONDARY_KEY on the proxy deployment.',
        'The GitHub Pages frontend should only receive VITE_API_BASE_URL, not the CDISC keys themselves.',
      ],
    };
  }

  return {
    title: 'API proxy health check failed',
    message: payload?.message ?? fallbackMessage,
    details: [
      `HTTP status: ${status}`,
      payload?.upstreamBaseUrl ? `Configured upstream: ${payload.upstreamBaseUrl}` : 'Verify the proxy can reach the CDISC upstream API.',
    ],
  };
};

const createProxyUnavailableIssue = (error: Error): BootstrapIssue => ({
  title: 'API proxy is unreachable',
  message:
    error.name === 'TypeError'
      ? 'DuckDeploy could not connect to the configured backend proxy.'
      : 'DuckDeploy could not reach the configured backend proxy.',
  details: [
    error.name === 'TypeError'
      ? 'The proxy may be stopped, deployed at a different URL, or blocked by CORS/origin policy.'
      : error.message,
    'Start the local proxy with `npm run proxy`, or deploy the backend proxy and set VITE_API_BASE_URL to its public base URL.',
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

  const resources = useMemo<ResourceDefinition[]>(
    () => (spec ? resolveAdminResources(spec, uiManifest) : []),
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
        const response = await fetch(healthUrl, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as ProxyHealthResponse | null;

        if (!response.ok || payload?.ok === false) {
          throw createProxyHealthIssue(
            response.status,
            payload,
            `Proxy health check returned ${response.status} ${response.statusText}.`,
          );
        }

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
          const normalizedError =
            issue instanceof Error ? issue : new Error(String(issue));
          setProxyIssue(createProxyUnavailableIssue(normalizedError));
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
    const issue = createSpecIssue(error);
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
    <Admin authProvider={duckDeployAuthProvider} dataProvider={openApiDataProvider}>
      <ResourceFactory resources={resources} />
    </Admin>
  );
};

export const App = () => (
  <WidgetRegistryProvider>
    <SpecProvider>
      <AdminApp />
    </SpecProvider>
  </WidgetRegistryProvider>
);

export default App;
