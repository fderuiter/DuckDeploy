import { Admin } from "react-admin";
import { SpecProvider, useSpec } from "./core/SpecContext";
import { duckDeployAuthProvider } from "./core/authProvider";
import { openApiDataProvider } from "./providers/openApiDataProvider";
import { ResourceFactory } from "./components/ResourceFactory";
import { WidgetRegistryProvider, registerWidget } from "./core/WidgetRegistry";
import { CustomMapWidget } from "./components/custom/CustomMapWidget";
import { TerminologyLookupInput } from "./components/custom/TerminologyLookupInput";

registerWidget('x-ui-custom-map', CustomMapWidget);
registerWidget('cdisc-terminology', TerminologyLookupInput);

const AdminApp = () => {
  const { isLoading, error } = useSpec();

  if (isLoading) {
    return <div>Loading OpenAPI Configuration...</div>;
  }

  if (error) {
    return <div>Error loading spec: {error.message}</div>;
  }

  return (
    <Admin authProvider={duckDeployAuthProvider} dataProvider={openApiDataProvider}>
      <ResourceFactory />
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
