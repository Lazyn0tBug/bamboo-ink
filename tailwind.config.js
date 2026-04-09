/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // 中国传统色 - OKLCH 颜色空间
        xuanzhi: {
          50: 'oklch(98% 0.01 90)',
          100: 'oklch(96% 0.015 85)',
          200: 'oklch(93% 0.02 80)',
          300: 'oklch(88% 0.025 75)',
          400: 'oklch(78% 0.035 70)',
          500: 'oklch(65% 0.045 65)',
        },
        mo: {
          50: 'oklch(96% 0.01 260)',
          100: 'oklch(90% 0.015 260)',
          200: 'oklch(80% 0.02 260)',
          300: 'oklch(65% 0.025 260)',
          400: 'oklch(35% 0.03 260)',
          500: 'oklch(18% 0.035 260)',
          600: 'oklch(10% 0.04 260)',
          700: 'oklch(5% 0.045 260)',
        },
        zhusha: {
          50: 'oklch(97% 0.02 25)',
          100: 'oklch(94% 0.035 25)',
          200: 'oklch(85% 0.06 25)',
          300: 'oklch(70% 0.12 25)',
          400: 'oklch(58% 0.18 25)',
          500: 'oklch(48% 0.22 25)',
          600: 'oklch(40% 0.24 25)',
          700: 'oklch(32% 0.26 25)',
        },
        juanbo: {
          50: 'oklch(98% 0.008 95)',
          100: 'oklch(96% 0.012 90)',
          200: 'oklch(92% 0.02 85)',
          300: 'oklch(88% 0.025 80)',
          400: 'oklch(78% 0.035 75)',
          500: 'oklch(65% 0.045 70)',
        },
        dai: {
          50: 'oklch(97% 0.015 220)',
          100: 'oklch(92% 0.025 220)',
          200: 'oklch(82% 0.04 220)',
          300: 'oklch(68% 0.08 220)',
          400: 'oklch(52% 0.14 220)',
          500: 'oklch(42% 0.18 220)',
          600: 'oklch(35% 0.22 220)',
        },
        zhu: {
          50: 'oklch(96% 0.02 30)',
          100: 'oklch(90% 0.04 30)',
          200: 'oklch(80% 0.08 30)',
          300: 'oklch(65% 0.14 30)',
          400: 'oklch(52% 0.2 30)',
          500: 'oklch(45% 0.24 30)',
        },
      },
      fontFamily: {
        // 书法字体 - 楷隶为主
        kai: [
          'Kaiti SC',
          'STKaiti',
          'KaiTi',
          'AR PL UKai CN',
          'AR PL UKai HK',
          'AR PL UKai TW',
          'Noto Serif CJK SC',
          'serif',
        ],
        li: ['LiSu', 'STLiti', 'Noto Serif CJK SC', 'serif'],
        zhuan: ['ZhuanTi', 'FangZhuan', 'STZhuan', 'serif'],
        wei: ['WeiTi', 'STWeiti', 'Noto Serif CJK SC', 'serif'],
        // 印刷字体
        song: ['Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', 'serif'],
        hei: ['Noto Sans SC', 'Source Han Sans SC', 'STHeiti', 'sans-serif'],
        yuan: ['Yuanti SC', 'STYuanti', 'Yuanti', 'Noto Serif CJK SC', 'serif'],
      },
    },
  },
  plugins: [],
};
