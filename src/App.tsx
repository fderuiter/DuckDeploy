import { Admin } from "react-admin";
import { SpecProvider, useSpec } from "./core/SpecContext";
import { openApiDataProvider } from "./providers/openApiDataProvider";
import { ResourceFactory } from "./components/ResourceFactory";
import { WidgetRegistryProvider, registerWidget } from "./core/WidgetRegistry";
import { CustomMapWidget } from "./components/custom/CustomMapWidget";
import { ReflectiveAuthProvider } from "./core/ReflectiveAuthContext";

registerWidget('x-ui-custom-map', CustomMapWidget);

const AdminApp = () => {
  const { isLoading, error } = useSpec();

  if (isLoading) {
    return <div>Loading OpenAPI Configuration...</div>;
  }

  if (error) {
    return <div>Error loading spec: {error.message}</div>;
  }

  return (
    <Admin dataProvider={openApiDataProvider}>
      <ResourceFactory />
    </Admin>
  );
};

export const App = () => (
  <WidgetRegistryProvider>
    <ReflectiveAuthProvider>
      <SpecProvider>
        <AdminApp />
      </SpecProvider>
    </ReflectiveAuthProvider>
  </WidgetRegistryProvider>
);

export default App;
