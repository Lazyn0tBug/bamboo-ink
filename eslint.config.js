import globals from 'globals';
import pluginAstro from 'eslint-plugin-astro';
import pluginReact from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', '.astro', 'public', '**/*.min.js', 'src/env.d.ts'],
  },
  ...tseslint.configs.recommended,
  ...pluginAstro.configs['flat/recommended'],
  {
    files: ['**/*.{js,jsx,ts,tsx,astro}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    plugins: {
      react: pluginReact,
    },
    rules: {
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
  },
  {
    files: ['**/*.astro'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
