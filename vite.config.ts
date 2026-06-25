/// <reference types="vitest" />
import { validateEnv } from './scripts/config/validate.mjs';
validateEnv('frontend');
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite plugin that blocks YAML / raw OpenAPI files and build-only scripts from
 * being imported into the browser bundle (Phase 5.1 – YAML Cloaking).
 *
 * Any accidental `import` of these paths inside the source tree will throw at
 * build time, making it impossible for raw backend structure to leak into the
 * production bundle.
 */
const yamlCloakingPlugin = (): Plugin => {
  const BLOCKED_PATTERNS = [
    /\.ya?ml$/i,
    /\/scripts\//,
    /manifest-generation-log/i,
    /ui-manifest\.sha256/i,
  ];

  return {
    name: 'yaml-cloaking',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;
      const absoluteSource = source.startsWith('/')
        ? source
        : path.resolve(path.dirname(importer), source);
      // Strip query strings and hash fragments before matching so patterns like
      // `openapi.yaml?raw` or `schema.yml?url` are caught correctly.
      const cleanSource = absoluteSource.replace(/[?#].*$/, '');
      if (BLOCKED_PATTERNS.some((re) => re.test(cleanSource))) {
        this.error(
          `[yaml-cloaking] Blocked import of "${source}" from "${importer}". ` +
            'Raw OpenAPI/build-script files must not be bundled into the browser runtime.',
        );
      }
      return null;
    },
  };
};

export default defineConfig({
  plugins: [yamlCloakingPlugin(), react()],
  base: '/DuckDeploy/',
  server: {
    proxy: {
      '/api/cdisc': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      // Explicitly treat YAML and build-script files as external so that any
      // import that slips past the plugin cannot be bundled.
      // The regex uses `(?:[?#]|$)` so that query-suffixed IDs like
      // `openapi.yaml?raw` are also matched.
      external: [/\.ya?ml(?:[?#]|$)/i, /\/scripts\/(?:[^?#].*)?(?:[?#]|$)/],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './setupTests.ts',
    css: false,
  },
});
