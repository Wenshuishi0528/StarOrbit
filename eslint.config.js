import js from '@eslint/js';
import globals from 'globals';

// Correctness checks only; formatting belongs to Prettier.
export default [
  {
    ignores: [
      'node_modules/',
      '.claude/',
      'dist/',
      'dist-local/',
      'output/',
      'publish/',
      'assets/',
      '.playwright-cli/',
      '.venv/',
      'tests/reference/',
      // Page scripts injected by browser acceptance runs, with their own globals.
      'tests/browser/',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Replaced by build.mjs at bundle time.
        __WEB_BUILD__: 'readonly',
        __GROUND_PATCH_WORKER__: 'readonly',
        __TELEMETRY_WORKLET_SOURCE__: 'readonly',
        __CITY_TERRAIN_WORKER__: 'readonly',
        __ELEVATION_WORKER__: 'readonly',
        __VIIRS_TRIAL__: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*worker*.js', 'src/**/*worklet*.js'],
    languageOptions: { globals: { ...globals.worker, ...globals.audioWorklet } },
  },
  {
    files: ['*.js', '*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // Node tests install DOM stubs on globalThis.
    files: ['tests/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Sanitisers deliberately match control characters.
      'no-control-regex': 'off',
      // Chinese UI text in template strings uses full-width spaces.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
      'preserve-caught-error': 'off',
    },
  },
  {
    // Compact fixtures often import helpers for a subset of assertions.
    files: ['tests/**/*.mjs', 'tests/**/*.js'],
    rules: { 'no-unused-vars': 'off' },
  },
];
