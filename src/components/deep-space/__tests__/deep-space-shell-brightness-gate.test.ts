import fs from "node:fs";
import path from "node:path";

/**
 * Home brightness auth gate — parity-QA finding from the authenticated capture
 * pass: DeepSpaceShell fired loadDomainLevels on userId alone, racing the boot
 * session restore. The Supabase reads went out without the restored access
 * token (anon) → RLS 401 on recreation_items, and the swallowed catch left the
 * first paint silently missing relation/recreation brightness with no retry.
 *
 * Pins (source discipline, like the sibling deep-space guards): the effect must
 * wait for BOTH the auth `loading` flag and `userId`, and re-fire when loading
 * settles — so the read always carries the session token.
 */
const SRC = fs.readFileSync(path.resolve(__dirname, "..", "DeepSpaceShell.tsx"), "utf8");

describe("deep-space home brightness auth gate", () => {
  test("loadDomainLevels waits for the session restore (loading) as well as userId", () => {
    expect(SRC).toMatch(/if \(loading \|\| !userId\) return;/);
  });

  test("the brightness effect re-fires when the session restore settles", () => {
    expect(SRC).toMatch(/\}, \[loading, userId\]\);/);
  });
});
