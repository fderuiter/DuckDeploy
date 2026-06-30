import { useEffect, useMemo, useState } from 'react';
import { Admin, I18nContextProvider, useTranslate, useLocaleState, Layout, AppBar, LocalesMenuButton } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import englishMessages from './locales/en';
import frenchMessages from './locales/fr';
import { SpecProvider, useSpec } from './core/SpecContext';
import { duckDeployAuthProvider, setAuthorizationResources } from './core/authProvider';
import { openApiDataProvider, setResourceDefinitions } from './providers/openApiDataProvider';
import {
  ResourceFactory,
  resolveAdminResources,
  resolveOperationMappings,
} from './components/ResourceFactory';
import { WidgetRegistryProvider, registerWidget } from './core/WidgetRegistry';
import { AccessibilityProvider } from './core/AccessibilityContext';
import { CustomMapWidget } from './components/custom/CustomMapWidget';
import { TerminologyLookupInput } from './components/custom/TerminologyLookupInput';
import { BootstrapScreen } from './components/BootstrapScreen';
import { getRuntimeApiConfig } from './core/runtimeConfig';
import { customInstance } from './api/custom-instance';
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

const getInitialLocale = () => {
  try {
    const stored = localStorage.getItem('RaStore.locale');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return 'en';
};

const translations: Record<string, any> = {
  en: englishMessages,
  fr: frenchMessages,
};

export const i18nProvider = polyglotI18nProvider(
  (locale) => translations[locale] || translations.en,
  getInitialLocale(),
  [
    { locale: 'en', name: 'English' },
    { locale: 'fr', name: 'Français' },
  ]
);

const createRuntimeConfigIssue = (translate: any): BootstrapIssue => ({
  title: translate('duckdeploy.bootstrap.api_not_configured.title'),
  message: translate('duckdeploy.bootstrap.api_not_configured.message'),
  details: [
    runtimeConfig.message ?? translate('duckdeploy.bootstrap.api_not_configured.detail_1'),
    translate('duckdeploy.bootstrap.api_not_configured.detail_2'),
  ],
});

const createNoResourcesIssue = (translate: any): BootstrapIssue => ({
  title: translate('duckdeploy.bootstrap.no_resources.title'),
  message: translate('duckdeploy.bootstrap.no_resources.message'),
  details: [
    translate('duckdeploy.bootstrap.no_resources.detail_1'),
    translate('duckdeploy.bootstrap.no_resources.detail_2'),
  ],
});

const CustomAppBar = (props: any) => (
  <AppBar {...props} toolbar={<LocalesMenuButton />} />
);

const CustomLayout = (props: any) => <Layout {...props} appBar={CustomAppBar} />;

const AdminApp = () => {
  const translate = useTranslate();
  const { spec, uiManifest, isLoading, error } = useSpec();
  const [proxyIssue, setProxyIssue] = useState<BootstrapIssue | null>(
    runtimeConfig.apiBaseUrl ? null : createRuntimeConfigIssue(translate),
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
                const payload = await customInstance<ProxyHealthResponse>({
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
            title: translate('duckdeploy.bootstrap.api_unreachable.title'),
            message: translate('duckdeploy.bootstrap.api_unreachable.message'),
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
        title={translate('duckdeploy.bootstrap.starting.title')}
        message={translate('duckdeploy.bootstrap.starting.message')}
        details={[
          translate('duckdeploy.bootstrap.starting.detail_1', { base_url: runtimeConfig.apiBaseUrl ?? 'not configured' }),
          translate('duckdeploy.bootstrap.starting.detail_2'),
        ]}
        loading
      />
    );
  }

    if (error) {
    const issue = (error as any).title ? (error as BootstrapIssue) : {
      title: translate('duckdeploy.bootstrap.failed.title'),
      message: translate('duckdeploy.bootstrap.failed.message'),
      details: [error.message],
    };
    return <BootstrapScreen title={issue.title} message={issue.message} details={issue.details} />;
  }

  if (proxyIssue) {
    return <BootstrapScreen title={proxyIssue.title} message={proxyIssue.message} details={proxyIssue.details} />;
  }

  if (resources.length === 0) {
    const issue = createNoResourcesIssue(translate);
    return <BootstrapScreen title={issue.title} message={issue.message} details={issue.details} />;
  }

  return (
    <Admin layout={CustomLayout} i18nProvider={i18nProvider} authProvider={duckDeployAuthProvider} dataProvider={openApiDataProvider}>
      <ResourceFactory resources={resources} />
    </Admin>
  );
};

export const App = () => {
  const HtmlLangSync = () => {
    const [locale] = useLocaleState();
    
    useEffect(() => {
      document.documentElement.lang = locale;
    }, [locale]);
    
    return null;
  };

  return (
    <I18nContextProvider value={i18nProvider}>
      <HtmlLangSync />
      <AccessibilityProvider>
        <WidgetRegistryProvider>
          <SpecProvider>
            <AdminApp />
          </SpecProvider>
        </WidgetRegistryProvider>
      </AccessibilityProvider>
    </I18nContextProvider>
  );
};

export default App;
