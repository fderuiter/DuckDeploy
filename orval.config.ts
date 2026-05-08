import { defineConfig } from 'orval';

export default defineConfig({
  duckdeploy_api: {
    input: './openapi.yaml',
    output: {
      mode: 'split',
      target: 'src/api/generated.ts',
      schemas: 'src/api/model',
      client: 'react-query',
      clean: true,
    },
  },
});
