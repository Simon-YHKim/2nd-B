// Jest mock for expo-document-picker (native ESM module, not transformed by
// ts-jest). Only the module's shape matters here: the tests that reach this
// exercise capture-file's MIME/size logic, never a real picker dialog, so
// getDocumentAsync defaults to "the user cancelled".
module.exports = {
  getDocumentAsync: async () => ({ canceled: true, assets: null }),
};
