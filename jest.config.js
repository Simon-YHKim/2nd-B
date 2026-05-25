/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Static assets (fonts/images) are not loadable in the node test env —
    // map them to a stub so modules that import them stay testable.
    "\\.(ttf|otf|woff|woff2|png|jpe?g|gif|svg|webp)$": "<rootDir>/__mocks__/fileMock.js",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react" } }],
  },
};
