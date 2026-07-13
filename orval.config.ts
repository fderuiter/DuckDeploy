import { defineConfig } from 'orval';
import fs from 'fs';

const input = fs.existsSync('./openapi.pruned.yaml') ? './openapi.pruned.yaml' : './openapi.yaml';

export default defineConfig({
  duckdeploy_api: {
    input,
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/model',
      client: 'axios',
      clean: true,
      override: {
        mutator: {
          path: 'src/api/custom-instance.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
