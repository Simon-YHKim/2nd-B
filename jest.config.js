/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Static assets (fonts/images) are not loadable in the node test env —
    // map them to a stub so modules that import them stay testable.
    "\\.(ttf|otf|woff|woff2|png|jpe?g|gif|svg|webp)$": "<rootDir>/__mocks__/fileMock.js",
    // expo-crypto ships ESM that ts-jest doesn't transform; map to a node-crypto mock.
    "^expo-crypto$": "<rootDir>/__mocks__/expo-crypto.js",
    // expo-localization, same reason. Defaults to a region-less locale so the
    // "platform reported no country" branch is what tests hit unless they say
    // otherwise — that is the branch the age gate must never get wrong.
    "^expo-localization$": "<rootDir>/__mocks__/expo-localization.js",
    // expo-document-picker, same reason. The picker itself is never exercised in
    // node; capture-file's MIME + size rules around it are.
    "^expo-document-picker$": "<rootDir>/__mocks__/expo-document-picker.js",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Nested git worktrees live in .worktrees/<branch> (full repo copies). Never
  // run their suites: they would double-run and collide on the haste map.
  // _sync/ holds archived snapshots from the 2026-09-05 worktree cleanup. Its
  // nested-dirty/*/untracked/ trees are the only copy of that material, so the
  // folder stays - but its two suites read sibling files that the snapshot does
  // not carry, so running them fails with ENOENT. The folder exists only in the
  // canonical checkout, which is why a worktree run never sees this.
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/.worktrees/",
    "<rootDir>/_sync/",
  ],
  // legacy/ holds retired renderers kept only to be read (legacy/screens/INDEX.md).
  // They are not compiled or linted, so they must not be collected here either.
  modulePathIgnorePatterns: ["<rootDir>/.worktrees/", "<rootDir>/_sync/", "<rootDir>/legacy/"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react" } }],
  },
};
