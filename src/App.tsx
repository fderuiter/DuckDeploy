import { useEffect, useMemo, useState } from 'react';
import { Admin, defaultTheme } from 'react-admin';
import { createTheme } from '@mui/material/styles';
import { GlobalStyles } from '@mui/material';

const defaultAppTheme = createTheme({
  ...defaultTheme,
  palette: {
    ...defaultTheme.palette,
    primary: {
      main: '#004282',
      dark: '#002f5e',
      light: '#33689b',
      contrastText: '#ffffff',
    },
    text: {
      primary: '#000000',
      secondary: '#222222',
    },
    background: {
      default: '#ffffff',
      paper: '#ffffff',
    }
  },
  components: {
    ...defaultTheme.components,
    MuiTypography: {
      styleOverrides: {
        root: {
          color: '#000000 !important',
          opacity: '1 !important',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: '#000000 !important',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          color: '#004282 !important',
        },
        contained: {
          color: '#ffffff !important',
          backgroundColor: '#004282 !important',
        },
      },
    },
  },
});
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
import { MANIFEST_FILENAME, HEALTH_CHECK_PATH } from '@duckdeploy/openapi';

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
    `Verify that ${MANIFEST_FILENAME} contains list fields for the desired resources.`,
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
          url: HEALTH_CHECK_PATH,
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
          setProxyIssue(issue as unknown as BootstrapIssue);
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
    const issue = (error as any).title ? (error as unknown as BootstrapIssue) : {
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
    <Admin authProvider={duckDeployAuthProvider} dataProvider={openApiDataProvider} layout={StandardLayout} theme={defaultAppTheme}>
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
    <GlobalStyles styles={{ 'div': { color: '#000000 !important', opacity: '1 !important' } }} />
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
