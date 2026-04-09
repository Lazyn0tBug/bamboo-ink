import { defineConfig } from 'astro/config';

export default defineConfig({
  // Astro 6 安全配置 - 启用 CSP
  security: {
    csp: true,
  },

  // Astro 6 实验性功能 - Rust 编译器
  experimental: {
    rustCompiler: true,
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
