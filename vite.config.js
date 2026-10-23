import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFile } from 'node:fs/promises';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    {
      name: 'github-pages-route-fallback',
      apply: 'build',
      async closeBundle() {
        await copyFile('dist/index.html', 'dist/404.html');
      },
    },
  ],
});
