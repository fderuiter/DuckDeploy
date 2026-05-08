import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const manifestHashPath = path.resolve(__dirname, 'public', 'ui-manifest.sha256');
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
