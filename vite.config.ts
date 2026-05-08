import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const manifestHashPath = path.resolve(configDir, 'public', 'ui-manifest.sha256');
const manifestHash = fs.existsSync(manifestHashPath)
  ? fs.readFileSync(manifestHashPath, 'utf8').trim()
  : '';

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
    /traceability-matrix/i,
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
      if (BLOCKED_PATTERNS.some((re) => re.test(absoluteSource))) {
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
  define: {
    'import.meta.env.VITE_MANIFEST_HASH': JSON.stringify(manifestHash),
  },
  build: {
    rollupOptions: {
      // Explicitly treat YAML and build-script files as external so that any
      // import that slips past the plugin cannot be bundled.
      external: [/\.ya?ml$/, /\/scripts\//],
    },
  },
});
