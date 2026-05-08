import { Admin } from "react-admin";
import { SpecProvider, useSpec } from "./core/SpecContext";
import { openApiDataProvider } from "./providers/openApiDataProvider";
import { ResourceFactory } from "./components/ResourceFactory";

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
  <SpecProvider>
    <AdminApp />
  </SpecProvider>
);

export default App;
