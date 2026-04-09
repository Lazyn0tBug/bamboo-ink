import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // Changed to jsdom for DOM testing
    include: ['tests/**/*.{test,spec}.{ts,js}'],
    exclude: ['node_modules', 'dist', '.astro', 'public'],
    setupFiles: ['./tests/setup.ts'], // Add setup file
    css: true,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '.astro', 'public', 'scripts'],
    },
  },
});
