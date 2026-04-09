import { defineConfig } from 'astro/config';
import { fontProviders } from 'astro/config';

export default defineConfig({
  // Astro 6 安全配置 - 临时禁用 CSP 以排查问题
  security: {
    csp: false,
  },

  // Astro 6 实验性功能 - Rust 编译器
  experimental: {
    rustCompiler: true,
  },

  // Astro 6 Fonts API - 自托管字体
  fonts: [
    {
      name: 'Noto Serif SC',
      cssVariable: '--font-noto',
      provider: fontProviders.fontsource(),
      weights: [300, 400, 500, 600, 700],
    },
    {
      name: 'Ma Shan Zheng',
      cssVariable: '--font-ma-shan-zheng',
      provider: fontProviders.fontsource(),
      weights: [400],
    },
  ],

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
