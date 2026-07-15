// Five sibling surveys guard the Android hardware back button while answers are in
// progress. Two did not: ipip-neo and rlss were missed by that sweep.
//
// ipip-neo is 120 items. A single back press closed the screen with no confirmation and
// took roughly fifteen minutes of the user's self-report with it. No modal, no warning,
// nothing saved.
//
// This is a sweep gap, not a design question -- which is exactly the kind of thing that
// stays broken, because nobody re-derives the rule for screen number six. So the rule is a
// test now: EVERY survey screen guards back, and any new one that does not fails the build.

import { readFileSync } from "fs";
import { resolve } from "path";

const read = (name: string): string =>
  readFileSync(resolve(__dirname, "..", `${name}.tsx`), "utf8").replace(/\r\n/g, "\n");

// Every screen where the user is mid-way through answering something they cannot get back.
const SURVEYS = [
  "values",
  "strengths",
  "big-five",
  "motivation",
  "attachment",
  "ipip-neo",
  "rlss",
] as const;

describe.each(SURVEYS)("%s guards the Android back button", (name) => {
  const src = read(name);

  test("the guard is reading the real screen", () => {
    expect(src.length).toBeGreaterThan(1000);
  });

  test("it intercepts hardwareBackPress", () => {
    expect(src).toMatch(/BackHandler\.addEventListener\("hardwareBackPress"/);
    // Returning true is what stops the default (close the screen and lose everything).
    expect(src).toMatch(/return true;/);
  });

  test("it only intercepts while there is something to lose", () => {
    // Guarding an empty survey would trap the user on a screen they have not started.
    expect(src).toMatch(/if \(!started \|\| Object\.keys\(responses\)\.length === 0 \|\| saved\) return;/);
  });

  test("it removes the subscription on unmount", () => {
    // ANDROID_QA_GUIDELINES: a leaked handler keeps swallowing back presses on LATER
    // screens, which is a worse bug than the one being fixed.
    expect(src).toMatch(/return \(\) => subscription\.remove\(\);/);
  });

  test("it asks before discarding, rather than just discarding", () => {
    expect(src).toMatch(/setExitConfirmOpen\(true\)/);
    // And the dialog is actually rendered -- a state nobody reads is a fix that does
    // nothing, which this session has already produced once.
    expect(src).toMatch(/visible=\{exitConfirmOpen\}/);
  });
});

describe("the survey list is not quietly incomplete", () => {
  test("every /app screen that collects `responses` is in SURVEYS", () => {
    // A sixth survey added without a back guard is the exact failure this file exists to
    // catch. If a screen collects responses and is not listed here, list it -- and give it
    // the guard.
    const { readdirSync } = require("fs") as typeof import("fs");
    const dir = resolve(__dirname, "..");
    const collectors = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => f.replace(/\.tsx$/, ""))
      .filter((name) => {
        const src = readFileSync(resolve(dir, `${name}.tsx`), "utf8");
        return /const \[responses, setResponses\] = useState/.test(src);
      });
    expect(collectors.sort()).toEqual([...SURVEYS].sort());
  });
});
