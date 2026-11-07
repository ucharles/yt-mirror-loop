// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const jest = require('eslint-plugin-jest');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['.expo/**', 'ios/*', 'build/*', 'coverage/*', 'e2e/report/*', 'src/engines/youtube/player/generated.ts', 'assets/player.html'] },
  {
    // Lazy requires keep native modules out of pure code paths and tests.
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/__tests__/**', 'test/**'],
    plugins: { jest },
    languageOptions: { globals: jest.environments.globals.globals },
    rules: {
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
      'import/first': 'off',
    },
  },
]);
