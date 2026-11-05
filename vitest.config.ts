import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/memory.json',
      '**/quarantine.json',
      '**/.axiom-state/**',
    ],
  },
});
