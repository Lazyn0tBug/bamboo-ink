/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // 中国传统色
        'xuanzhi': {
          50: '#FEFDFB',
          100: '#F7F5F0',
          200: '#EFEBE1',
          300: '#E0D8C8',
          400: '#C8B898',
          500: '#A89878',
        },
        'mo': {
          50: '#F5F5F5',
          100: '#E5E5E5',
          200: '#CCCCCC',
          300: '#A8A8A8',
          400: '#5C5C5C',
          500: '#2C2C2C',
          600: '#1A1A1A',
          700: '#0D0D0D',
        },
        'zhusha': {
          50: '#FEF5F5',
          100: '#FDE8E8',
          200: '#FAC8C8',
          300: '#F59898',
          400: '#E86868',
          500: '#C43C3C',
          600: '#A02828',
          700: '#802020',
        },
        'juanbo': {
          50: '#FEFEFB',
          100: '#F9F8F0',
          200: '#F0EDD8',
          300: '#E0D8C8',
          400: '#C8B898',
          500: '#A89878',
        },
      },
      fontFamily: {
        'song': ['Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', 'serif'],
        'kai': ['Noto Serif SC', 'STKaiti', 'KaiTi', 'serif'],
        'hei': ['Noto Sans SC', 'Source Han Sans SC', 'STHeiti', 'sans-serif'],
      },
      fontSize: {
        'guji': ['18px', { lineHeight: '2' }],
      },
    },
  },
  plugins: [],
}
