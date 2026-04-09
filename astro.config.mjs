import { defineConfig } from 'astro/config';

export default defineConfig({
  // Astro 6 安全配置 - 启用 CSP
  security: {
    csp: true,
  },

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
