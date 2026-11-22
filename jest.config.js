module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/\\._'],
  testMatch: ['<rootDir>/test/**/*.test.ts', '<rootDir>/test/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // The host Superset provides @superset-ui/chart-controls at runtime; it is not installed here.
  moduleNameMapper: {
    '^@superset-ui/chart-controls$': '<rootDir>/test/__mocks__/chartControlsMock.ts',
    '\\.css$': '<rootDir>/test/__mocks__/styleMock.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
