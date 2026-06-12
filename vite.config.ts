import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  // Served from GitHub Pages under https://<user>.github.io/<repo>/, so asset URLs
  // must be prefixed with the repo name. Must match the repo exactly (with slashes).
  base: '/gradient-factor-visualizer/',
  plugins: [react()],
});
