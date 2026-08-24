// The web and the native builds get their vendor posture from DIFFERENT
// SOURCES, and nothing was comparing them.
//
//   web     web-deploy.yml reads GitHub repo Variables
//   native  eas.json literals (EAS builds and OTA both read these)
//
// On 2026-08-24 they had diverged completely. The console had flipped the repo
// Variables to OpenAI over the previous two days; eas.json still said "gemini"
// for every switch, and EXPO_PUBLIC_LLM_VENDOR was absent, which falls through
// to the phase rule - Phase 1, which is Gemini for all twelve reasoning seats.
//
// So every native build, INCLUDING THE v0.2.0 APK PUBLISHED ON GITHUB
// RELEASES, sent every AI call to Gemini. Google stops accepting Standard keys
// in September; that build would have stopped working for every AI feature and
// the web would have looked fine the whole time.
//
// It was visible in the ledger and nobody was looking: interview_probe served
// by gemini at 08-23 22:31, hours AFTER the backbone flip, next to an openai
// row from 16:04. Two builds, two postures, one table.
//
// This file pins the native posture so a change is deliberate, and states the
// web values it is supposed to match. It cannot READ the repo Variables - they
// are not in the repo - so parity is asserted against a written record, and
// keeping that record current is the point of the failure message.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const EAS = JSON.parse(read("eas.json")) as {
  build: Record<string, { env?: Record<string, string> }>;
};

// The repo Variables the web builds from, measured 2026-08-24. If someone
// changes a Variable and not this list, the next person comparing the two has
// no way to know which one is stale - which is exactly the state this file was
// written to end.
const WEB_POSTURE: Record<string, string> = {
  EXPO_PUBLIC_LLM_VENDOR: "perPurpose",
  EXPO_PUBLIC_CHAT_VENDOR: "openai",
  EXPO_PUBLIC_MULTIMODAL_VENDOR: "openai",
  EXPO_PUBLIC_BACKBONE_VENDOR: "openai",
  EXPO_PUBLIC_EMBED_VENDOR: "openai",
};

// Deliberate divergences, each with the reason. This list is what stops the
// test above from being a rule nobody can follow.
const INTENDED_DIFFERENCES: Record<string, string> = {
  // 3x cost per call on the purposes it covers. The console left it out of
  // eas.json on purpose so native stays off while web experiments; absence is
  // "off" and an empty string would make eas-cli refuse the whole file.
  EXPO_PUBLIC_CROSSCHECK: "native stays off - 3x cost, web-only trial",
  // Both still gemini in both places, so they are not a divergence yet. They
  // become one the day the September decommission moves either of them.
  EXPO_PUBLIC_FAILOVER_VENDOR: "still gemini everywhere until the September cutover",
  EXPO_PUBLIC_SAFETY_VENDOR: "still gemini everywhere; the feature is off by default",
};

const PROFILES = ["preview", "production"] as const;

describe("the native posture matches the web", () => {
  test.each(PROFILES)("%s carries every vendor switch the web sets", (profile) => {
    const env = EAS.build[profile]?.env ?? {};
    for (const [key, want] of Object.entries(WEB_POSTURE)) {
      expect(`${profile}.${key}=${env[key]}`).toBe(`${profile}.${key}=${want}`);
    }
  });

  test("preview and production do not disagree with each other", () => {
    // The APK people install and the AAB Play serves must behave the same.
    const a = EAS.build.preview?.env ?? {};
    const b = EAS.build.production?.env ?? {};
    for (const key of Object.keys(WEB_POSTURE)) expect(a[key]).toBe(b[key]);
  });

  test("EXPO_PUBLIC_LLM_VENDOR is PRESENT, because absence is not neutral here", () => {
    // Absent falls through to the phase rule, and EXPO_PUBLIC_LLM_PHASE is "1",
    // which resolves gemini for all twelve reasoning seats. "Unset" reads like
    // "no opinion" and is actually the strongest possible opinion.
    for (const profile of PROFILES) {
      expect(EAS.build[profile]?.env?.EXPO_PUBLIC_LLM_VENDOR).toBeTruthy();
    }
  });

  test("every divergence from the web list is a named decision", () => {
    // Anything that is neither matched nor explained is drift.
    const easKeys = new Set(
      PROFILES.flatMap((p) => Object.keys(EAS.build[p]?.env ?? {})).filter((k) => /_VENDOR$|CROSSCHECK$/.test(k)),
    );
    const unexplained = [...easKeys].filter(
      (k) => !(k in WEB_POSTURE) && !(k in INTENDED_DIFFERENCES),
    );
    expect(unexplained).toEqual([]);
  });
});

describe("the trap that made this invisible", () => {
  test("no empty string, which would kill every build", () => {
    // eas-cli refuses to parse a file with an empty env value, so "unset it by
    // blanking it" takes down builds and OTA together. Absence is the only way
    // to express unset here - which is why absence has to be checked for
    // meaning rather than treated as neutral.
    for (const profile of Object.keys(EAS.build)) {
      for (const [k, v] of Object.entries(EAS.build[profile]?.env ?? {})) {
        expect(`${profile}.${k}`).toBe(v === "" ? "MUST NOT BE EMPTY" : `${profile}.${k}`);
      }
    }
  });

  test("OTA carries these values, so installed apps can be moved without a rebuild", () => {
    // The reason updating eas.json is the fix and not just paperwork: the OTA
    // job mirrors eas.json's EXPO_PUBLIC_* into the published bundle, so the
    // already-released APK can be migrated off Gemini by an update rather than
    // by asking people to reinstall.
    const ota = read(".github/workflows/eas-update.yml");
    expect(ota).toContain("eas.json");
    expect(ota).toMatch(/EXPO_PUBLIC_/);
  });
});
