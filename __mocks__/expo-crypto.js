// Jest mock for expo-crypto (native ESM module, not transformed by ts-jest).
// digestStringAsync delegates to node crypto so the SHA-1 hash is real — keeps
// the HIBP k-anonymity logic in auth.ts testable, not just loadable.
const nodeCrypto = require("crypto");

module.exports = {
  CryptoDigestAlgorithm: { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  digestStringAsync: async (_algorithm, data) =>
    nodeCrypto.createHash("sha1").update(String(data)).digest("hex"),
};
