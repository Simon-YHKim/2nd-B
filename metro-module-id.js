// Deterministic Metro module ids — so two builds of the same commit produce the
// same bytes.
//
// Why this exists (measured 2026-09-08, fixed 2026-09-13):
//
// The web publish gate compares an APPROVED artifact digest against the digest
// of the artifact it just built. That only works if a build is reproducible.
// It was not. Re-running the *same* push build on the *same* commit produced a
// different digest, and unpacking both artifacts showed every JS chunk hash had
// changed. A 39-byte chunk named the cause outright:
//
//   build A:  __d(function(g,r,i,a,m,e,d){},3496,[]);
//   build B:  __d(function(g,r,i,a,m,e,d){},2375,[]);
//
// Metro's default id factory is a counter: the first module it is asked about
// gets 0, the next 1, and so on. So an id encodes *when the module was reached*,
// not which module it is. Graph traversal runs across worker processes, so that
// order shifts between builds and every id shifts with it.
//
// Emission order rides on the same thing. Both serializers sort modules by id
// (metro `Serializers/baseJSBundle.js`, `@expo/metro-config`
// `serializer/serializeChunks.js:getSortedModules`) AFTER assigning ids in
// iteration order — which makes the sort a no-op and leaves the bundle in
// traversal order. So pinning ids to the module path fixes the ids *and* the
// order in one move: the sort finally has a traversal-independent key.
//
// The id is a hash of the path RELATIVE to the project root, with separators
// normalised, because the same commit is built from different absolute paths
// (CI runner, canonical checkout, any of the worktrees) and on both Windows and
// Linux. An absolute or platform-shaped id would reintroduce exactly the drift
// this removes.
//
// ⚠ metro.config.js is NOT an EAS fingerprint source (measured 2026-09-13 with
// @expo/fingerprint 0.19.5, platform android: 190 sources — 119 file, 66 dir,
// 5 contents; metro.config.js and babel.config.js appear in none of them). So
// this does not move the runtime version and does not break OTA compatibility
// for builds already installed. It does change every chunk hash once, which is
// expected and harmless: the web export is content-addressed.

const crypto = require("node:crypto");
const path = require("node:path");

// Bump this if the collision guard below ever fires. Changing it reshuffles
// every id deterministically, which is enough to separate a colliding pair.
// It is a fixed-length constant prefix, so hashing it before the path needs no
// separator byte to stay unambiguous.
const ID_SALT = "2nd-B/metro-module-id/v1";

// 31 bits keeps every id a positive int32. Over ~5,000 modules the birthday
// probability of a collision is ~0.3%, which is why the guard exists rather
// than being treated as impossible — and a collision is deterministic per
// commit, so it fails the same way on every build instead of flapping.
const ID_BITS = 0x7fffffff;

/**
 * Build a Metro `createModuleIdFactory`. Each call returns a fresh factory with
 * its own collision table, matching Metro's contract (one factory per build).
 *
 * @param {string} projectRoot absolute path the ids are made relative to
 */
function createDeterministicModuleIdFactory(projectRoot) {
  return function createModuleIdFactory() {
    /** @type {Map<number, string>} id -> the relative path that claimed it */
    const claimed = new Map();

    return (modulePath) => {
      const relative = path
        .relative(projectRoot, modulePath)
        .split(path.sep)
        .join("/");
      const id =
        crypto
          .createHash("sha1")
          .update(ID_SALT)
          .update(relative)
          .digest()
          .readUInt32BE(0) & ID_BITS;

      const holder = claimed.get(id);
      if (holder !== undefined && holder !== relative) {
        throw new Error(
          `metro module id collision at ${id}: "${relative}" and "${holder}". ` +
            "Bump ID_SALT in metro-module-id.js to reshuffle.",
        );
      }
      claimed.set(id, relative);
      return id;
    };
  };
}

module.exports = { createDeterministicModuleIdFactory, ID_SALT, ID_BITS };
