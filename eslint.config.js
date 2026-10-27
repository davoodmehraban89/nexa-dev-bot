import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', '.wrangler/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node }
    },
    // Adopt safety errors now; legacy cleanup stays visible without changing logic
    // in the formatting-only commit. Review warnings in separate behavior PRs.
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
      'no-useless-escape': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
