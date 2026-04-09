import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  build: {
    format: 'file'
  },
  vite: {
    build: {
      assetsInlineLimit: 0
    }
  }
});
