import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  build: {
    format: 'file',
  },
  vite: {
    css: {
      postcss: './postcss.config.js',
    },
    build: {
      assetsInlineLimit: 0,
    },
  },
});
