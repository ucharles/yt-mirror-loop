/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/ios',
  setupFiles: ['<rootDir>/test/setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)', '<rootDir>/scripts/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/'],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/__tests__/**', '!src/app/**', '!src/engines/youtube/player/generated.ts'],
  coverageThreshold: {
    global: { lines: 80 },
    './src/domain/': { lines: 95 },
  },
};
