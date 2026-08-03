// npm run verify:web -- the full Expo web static export, the one thing
// `npm run verify` does not do.
//
// verify has no bundling step, so a local green run can still fail CI's
// web-export-smoke and recapture jobs. check:asset-exts catches the common
// cause in a second; this is the real thing, for when you want certainty
// before pushing an integration branch.
//
// Plain node rather than cross-env so this needs no new dependency.

const { spawnSync } = require("node:child_process");
const { rmSync } = require("node:fs");

const OUT = "dist-smoke";

// shell:true matters on Windows: npx is a .cmd shim there and spawning it
// directly fails with EINVAL and no output at all.
const res = spawnSync("npx expo export --platform web --output-dir " + OUT, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_UI: "deep-space", EXPO_USE_STATIC: "true" },
});

if (res.error) {
  console.error("\nWEB EXPORT FAIL  could not start the export: " + res.error.message);
  process.exit(1);
}

try {
  rmSync(OUT, { recursive: true, force: true });
} catch {
  // leaving the directory behind is not worth failing the check over
}

if (res.status !== 0) {
  console.error("\nWEB EXPORT FAIL  the web bundle did not build.");
  process.exit(res.status ?? 1);
}
console.log("\nWEB EXPORT PASS  the static web bundle builds.");
