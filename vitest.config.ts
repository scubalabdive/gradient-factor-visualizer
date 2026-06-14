import { defineConfig } from 'vitest/config';

// Single test gate for the whole monorepo. The engine ships the regression
// fixture (spec Section 12) that protects BOTH apps; gas-model ships its own
// (spec Section 9). Node-only environment — the engine and gas-model are pure
// and must never touch the DOM, and the app's tests are logic-only.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    globals: false,
  },
});
