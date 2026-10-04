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

// A survey the dashboard phone can host registers its guard through
// useHardwareBack (src/lib/nav/phone-embed.tsx) instead: the same focused
// BackHandler listener standalone, the phone's claim stack inside the phone. The
// subscription and its removal then live in that hook, so they are checked there.
const PHONE_EMBED = readFileSync(resolve(__dirname, "..", "..", "lib", "nav", "phone-embed.tsx"), "utf8")
  .replace(/\r\n/g, "\n");
const usesPhoneBack = (src: string): boolean => /useHardwareBack\(useCallback\(/.test(src);

// Every screen where the user is mid-way through answering something they cannot get back.
//
// 2026-10-05: "big-five" left this list. The route file used to carry the legacy
// survey (and its back guard) for the EXPO_PUBLIC_UI=legacy track; that lever and the
// survey left together (Simon decision Q-261004-11 C), and the route is now a wrapper
// around dds-big-five-screen.tsx, which keeps its draft in a `phase` state machine
// rather than `responses` + `started`. Its guard is checked below in its own shape.
const SURVEYS = [
  "values",
  "strengths",
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
    if (usesPhoneBack(src)) {
      expect(PHONE_EMBED).toMatch(/BackHandler\.addEventListener\("hardwareBackPress", handler\)/);
    } else {
      expect(src).toMatch(/BackHandler\.addEventListener\("hardwareBackPress"/);
    }
    // Returning true is what stops the default (close the screen and lose everything).
    expect(src).toMatch(/return true;/);
  });

  test("it only intercepts while there is something to lose", () => {
    // Guarding an empty survey would trap the user on a screen they have not started.
    // (The always-registered useHardwareBack form says so by returning false.)
    expect(src).toMatch(
      usesPhoneBack(src)
        ? /if \(!started \|\| Object\.keys\(responses\)\.length === 0 \|\| saved\) return false;/
        : /if \(!started \|\| Object\.keys\(responses\)\.length === 0 \|\| saved\) return;/,
    );
  });

  test("it removes the subscription on unmount", () => {
    // ANDROID_QA_GUIDELINES: a leaked handler keeps swallowing back presses on LATER
    // screens, which is a worse bug than the one being fixed.
    if (usesPhoneBack(src)) {
      // Removed on blur and unmount (useFocusEffect cleanup), and the phone claim released.
      expect(PHONE_EMBED).toMatch(/useFocusEffect\(useCallback\(\(\) => \{\n    if \(embed\) return embed\.claimBack\(handler\);/);
      expect(PHONE_EMBED).toMatch(/return \(\) => sub\.remove\(\);/);
    } else {
      expect(src).toMatch(/return \(\) => subscription\.remove\(\);/);
    }
  });

  test("it asks before discarding, rather than just discarding", () => {
    expect(src).toMatch(/setExitConfirmOpen\(true\)/);
    // And the dialog is actually rendered -- a state nobody reads is a fix that does
    // nothing, which this session has already produced once.
    expect(src).toMatch(/visible=\{exitConfirmOpen\}/);
  });
});

describe("big-five (shipped screen) guards the Android back button", () => {
  const src = readFileSync(
    resolve(__dirname, "..", "..", "screens", "deepspace", "dds-big-five-screen.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const route = read("big-five");

  test("the route renders this screen and nothing else", () => {
    expect(route).toMatch(/export default function BigFive\(\) \{\s*return <DeepSpaceBigFiveScreen \/>;\s*\}/);
    expect(src.length).toBeGreaterThan(1000);
  });

  test("it intercepts Back through the phone-aware hook, only while there is something to lose", () => {
    expect(usesPhoneBack(src)).toBe(true);
    expect(PHONE_EMBED).toMatch(/BackHandler\.addEventListener\("hardwareBackPress", handler\)/);
    expect(PHONE_EMBED).toMatch(/return \(\) => sub\.remove\(\);/);
    // Nothing to lose (not mid-questions with a dirty draft, not saving, not saved) -> false.
    expect(src).toContain('if (phase !== "saved" && !submitting && (phase !== "questions" || !dirty)) return false;');
  });

  test("it asks before discarding, and the dialog is actually rendered", () => {
    expect(src).toMatch(/else setExitOpen\(true\);\s*\n\s*return true;/);
    expect(src).toContain('visible={exitOpen && phase === "questions" && !submitting}');
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
