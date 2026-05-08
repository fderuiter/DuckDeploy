import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: './openapi.yaml',
    output: {
      mode: 'split',
      client: 'react-query',
      target: 'src/api/generated.ts',
      schemas: 'src/api/model',
      clean: true,
    },
  },
})
