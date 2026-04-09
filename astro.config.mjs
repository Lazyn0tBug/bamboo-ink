import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind({
    applyBaseStyles: false,
  })],
  output: 'static',
  build: {
    format: 'file'
  },
  vite: {
    css: {
      modules: {
        localsConvention: 'camelCase'
      }
    },
    build: {
      assetsInlineLimit: 0
    }
  }
});
