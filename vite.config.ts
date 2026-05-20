import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appRoot, '..');

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
  resolve: {
    alias: {
      '@workspace': workspaceRoot,
    },
  },
});
