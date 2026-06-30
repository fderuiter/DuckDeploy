import englishMessages from 'ra-language-english';

const customEnglishMessages = {
  ...englishMessages,
  duckdeploy: {
    bootstrap: {
      api_not_configured: {
        title: 'API proxy is not configured',
        message: 'DuckDeploy needs a deployed backend proxy before the UI can call CDISC.',
        detail_1: 'Set VITE_API_BASE_URL to the deployed proxy base URL.',
        detail_2: 'Keep CDISC_PRIMARY_KEY and CDISC_SECONDARY_KEY on the proxy host only; do not inject them into the frontend build.',
      },
      no_resources: {
        title: 'No resources were discovered',
        message: 'DuckDeploy loaded the schema and manifest, but no listable resources were available for React-Admin.',
        detail_1: 'Verify that ui-manifest.json contains list fields for the desired resources.',
        detail_2: 'If the OpenAPI contract changed, regenerate the manifest with `npm run generate` and rebuild the app.',
      },
      api_unreachable: {
        title: 'API proxy is unreachable',
        message: 'DuckDeploy could not reach the configured backend proxy.',
      },
      starting: {
        title: 'Starting DuckDeploy',
        message: 'Loading the compiled schema, UI manifest, and backend proxy configuration.',
        detail_1: 'API base: %{base_url}',
        detail_2: 'CDISC secrets stay on the proxy backend; the frontend only talks to that proxy.',
      },
      failed: {
        title: 'Application bootstrap failed',
        message: 'DuckDeploy could not load the compiled schema or UI manifest required to start.',
      },
    },
    a11y: {
      status: {
        loading: 'Loading data',
        saving: 'Saving data',
        success: 'Save complete',
        error_details: 'Save failed: %{details}',
        error: 'Save failed',
        empty: 'Empty list',
        loaded: 'Loaded %{details} items',
      },
      polymorphic: {
        update: 'Form structure updated for %{name}.',
        update_default: 'Form structure updated for new selection.',
      },
    },
    input: {
      polymorphic: {
        select_type: 'Select Type',
        option: 'Option %{index}',
      },
    },
  },
};

export default customEnglishMessages;
