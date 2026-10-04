// Lint rules. Beyond the usual recommended sets, this enforces the two rules
// the engine lives by (ROADMAP §20): src/game stays pure (no React, no UI),
// and all of its randomness goes through rng.ts so saves replay exactly.

import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'mobile', 'node_modules', 'public/sw.js'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/game/**/*.ts'],
    ignores: ['src/game/**/*.test.ts', 'src/game/testkit.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: 'The engine is pure TypeScript. Keep React in src/ui.' },
            { group: ['../ui/*', '../svg/*'], message: 'The engine must not depend on the UI.' },
          ],
        },
      ],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use rng.ts so a save always replays the same future.' }],
    },
  },
  {
    files: ['**/*.test.ts', 'src/game/testkit.ts', 'scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
