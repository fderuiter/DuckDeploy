import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const manifestHashPath = path.resolve(configDir, 'public', 'ui-manifest.sha256');
const manifestHash = fs.existsSync(manifestHashPath)
  ? fs.readFileSync(manifestHashPath, 'utf8').trim()
  : '';

export default defineConfig({
  plugins: [react()],
  base: '/DuckDeploy/',
  define: {
    'import.meta.env.VITE_MANIFEST_HASH': JSON.stringify(manifestHash),
  },
});
