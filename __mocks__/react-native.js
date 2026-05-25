// Minimal react-native mock for the ts-jest node environment. The repo's
// logic tests do not touch RN; this only serves theme tests that read
// Platform.select() from src/theme/typography.ts.
module.exports = {
  Platform: {
    OS: "ios",
    select: (specifics) =>
      specifics && (specifics.ios ?? specifics.native ?? specifics.default),
  },
};
