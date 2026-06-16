import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
//
// Relative base so the built bundle works wherever it is served — local `vite
// preview`, a sub-path on GitHub Pages, or a standalone host. The sibling
// gf-visualizer pins an absolute repo base because its Pages deploy is already
// wired; the planner's deploy path is a fast-follow, so we stay portable here.
export default defineConfig({
  base: './',
  plugins: [react()],
});
