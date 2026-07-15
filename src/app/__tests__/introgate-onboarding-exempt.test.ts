import fs from "node:fs";
import path from "node:path";

/**
 * IntroGate global C10 gate — /onboarding exemption (login-first loop fix).
 *
 * The C10 gate in _layout.tsx redirects any authenticated no-profile session off
 * every non-(auth) screen to /complete-profile. Under login-first entry (#1000),
 * onboarding runs right AFTER /complete-profile, so if IntroGate also guarded
 * /onboarding it would yank the just-completed user off the carousel inside the
 * post-refresh stale-hasProfile window, re-opening the E2E-2
 * /onboarding <-> /complete-profile "Maximum update depth exceeded" loop.
 *
 * Pin: the C10 redirect condition must exempt BOTH "(auth)" and "onboarding".
 * onboarding is a content-only carousel (no Gemini/feature path — it calls no
 * classifyInput/callGemini), so exempting it does NOT weaken C10; the profile
 * gate still holds at "/" (DeepSpaceShell) before onboarding and on the way out.
 */
const SRC = fs.readFileSync(path.resolve(__dirname, "..", "_layout.tsx"), "utf8");

describe("IntroGate C10 gate exempts /onboarding (login-first loop fix)", () => {
  test("the hasProfile===false -> /complete-profile redirect exempts both (auth) and onboarding", () => {
    expect(SRC).toMatch(
      /hasProfile === false[\s\S]{0,140}segments\[0\] !== "\(auth\)"[\s\S]{0,80}segments\[0\] !== "onboarding"/,
    );
  });

  test("the exempted C10 redirect still targets /complete-profile", () => {
    expect(SRC).toMatch(/segments\[0\] !== "onboarding"[\s\S]{0,80}Redirect href="\/complete-profile"/);
  });
});
