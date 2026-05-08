import { defineConfig } from 'orval';

export default defineConfig({
  duckdeploy_api: {
    input: './openapi.yaml',
    output: {
      mode: 'tags-split',
      target: 'src/api/generated/index.ts',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      clean: true,
      override: {
        mutator: {
          path: './src/api/custom-instance.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
