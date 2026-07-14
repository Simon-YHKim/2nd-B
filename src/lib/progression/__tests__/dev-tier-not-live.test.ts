// EXPO_PUBLIC_ALLOW_DEV_TIER makes the web build honour `?tier=all` URL links,
// which self-grant a paid tier (dev-tier-url.ts). It is a QA affordance and must
// never be hardcoded on in a build config that ships to users: web-deploy.yml's
// push trigger IS the public GitHub Pages site, and eas.json's profiles are the
// store builds.
//
// It WAS hardcoded to "true" in web-deploy.yml, shipping a URL-param paywall
// bypass to the live site, and survived even though the comment right above it
// warned "MUST be removed before the public launch build". A comment is not a
// gate. This test is.

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// A literal truthy assignment: `EXPO_PUBLIC_ALLOW_DEV_TIER: "true"` / `: true` /
// `=true`. A `${{ ... }}` expression is allowed — that is how the QA opt-in is
// threaded through a manual workflow_dispatch input.
const HARDCODED_TRUE = /EXPO_PUBLIC_ALLOW_DEV_TIER["']?\s*[:=]\s*["']?true["']?/i;

describe("EXPO_PUBLIC_ALLOW_DEV_TIER is never hardcoded on in a shipping build", () => {
  test.each([
    [".github/workflows/web-deploy.yml", "the live GitHub Pages site"],
    [".github/workflows/android-release.yml", "the Play store build"],
    ["eas.json", "the EAS native build profiles"],
  ])("%s (%s) does not hardcode it true", (file) => {
    expect(read(file)).not.toMatch(HARDCODED_TRUE);
  });

  test("web-deploy.yml gates it behind a workflow_dispatch input, so a push to main resolves it false", () => {
    const yml = read(".github/workflows/web-deploy.yml");
    // The env value must be an expression referencing the dispatch input, not a
    // literal. `inputs` is empty on a push event, so main deploys resolve "false".
    expect(yml).toMatch(/EXPO_PUBLIC_ALLOW_DEV_TIER:\s*\$\{\{[^}]*inputs\.allow_dev_tier[^}]*\}\}/);
    expect(yml).toMatch(/allow_dev_tier:\s*\n\s+description:/);
    expect(yml).toMatch(/type:\s*boolean\s*\n\s+default:\s*false/);
  });
});
