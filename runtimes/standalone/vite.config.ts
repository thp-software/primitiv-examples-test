import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // GitHub Pages: assets are served from /<repo-name>/
  // Change this to match your GitHub repository name.
  base: '/primitiv-examples-test/',

  server: {
    fs: {
      // Allow serving files from the repository root
      // because our applications/ folder is two levels up from the runtime root.
      allow: ['../../'],
    },
  },
});
