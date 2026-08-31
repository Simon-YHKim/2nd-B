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

// The values the web builds from, measured 2026-08-24: a repo Variable where
// one exists, the code default where none does (those entries say so). If
// someone changes a Variable and not this list, the next person comparing the
// two has no way to know which one is stale - which is exactly the state this
// file was written to end.
const WEB_POSTURE: Record<string, string> = {
  EXPO_PUBLIC_LLM_VENDOR: "perPurpose",
  EXPO_PUBLIC_CHAT_VENDOR: "openai",
  EXPO_PUBLIC_MULTIMODAL_VENDOR: "openai",
  EXPO_PUBLIC_BACKBONE_VENDOR: "openai",
  EXPO_PUBLIC_EMBED_VENDOR: "openai",
  // Moved out of INTENDED_DIFFERENCES on 2026-08-24: the console's alpha order
  // asked for the current GH variables to reach the eas.json path too, naming
  // CROSSCHECK=1 among them. Its blast radius is one purpose
  // (CROSSCHECKABLE = persona_synthesis) at up to 2 rounds, not 3x everything.
  EXPO_PUBLIC_CROSSCHECK: "1",
  // Promoted from WEB_POSTURE_REQUESTED on 2026-08-29: the repo Variable was
  // set at 12:33 KST (`gh variable list` → none, 2026-08-29T03:33:19Z), ten
  // minutes after this file had recorded it as unset. WHO set it is unknown —
  // the console says it was not them (2026-08-30 reply), so it was Simon or
  // another session. The promotion rests on the measurement, not on the actor.
  // eas.json carried it first (#1479, bundled with the 9/1 build).
  EXPO_PUBLIC_FAILOVER_VENDOR: "none",
  // NOT a Variable — the web has none for this key (`gh variable list`,
  // 2026-08-31), so the web builds from the CODE default, which T1 stage A
  // made openai (routing.ts RETIRED_DEFAULT). eas.json says "openai"
  // explicitly, so the two agree; this entry pins that agreement, and it
  // breaks if either the default or eas.json moves alone. The feature itself
  // is still off (EXPO_PUBLIC_SERVER_SAFETY); this is the seat it would use.
  EXPO_PUBLIC_SAFETY_VENDOR: "openai",
};

// The third state, and the one this file had no bucket for: native has already
// moved and the web has been ASKED to follow. Neither "matched" nor "a named
// divergence" describes that, and writing an unconfirmed value into
// WEB_POSTURE would turn a measurement into a wish - the exact drift this file
// exists to catch. So it gets its own list, with who was asked and when.
//
// The assertion is the same as WEB_POSTURE's (eas.json must carry the value);
// what differs is the claim about the web, which is "requested", not "read".
const WEB_POSTURE_REQUESTED: Record<string, { want: string; asked: string }> = {
  // Empty as of 2026-08-29 12:33 KST - EXPO_PUBLIC_FAILOVER_VENDOR lived here
  // for about an hour and was promoted to WEB_POSTURE once the Variable was
  // found set (by whom is unknown, see the entry above). The bucket stays:
  // the next switch that moves native-first lands
  // here, with who was asked and when, until the web is READ to match.
  //
  // What that entry recorded, kept because it is the reason the bucket exists:
  // eas.json is a FINGERPRINT INPUT, so a vendor switch there moves only
  // bundled with a build (#1375), and it is NOT the only source - the repo
  // Variable also feeds web-deploy.yml:140 (the web) and android-release.yml:124
  // (the diagnostic gradle APK), both passing '' when the Variable is unset —
  // and '' meant "gemini" in the code until T1 stage A (2026-08-31), "none"
  // since.
  // So "native moved, web asked" is a real intermediate state, and writing the
  // asked value into WEB_POSTURE would turn a measurement into a wish.
};

// Deliberate divergences, each with the reason. This list is what stops the
// test above from being a rule nobody can follow.
const INTENDED_DIFFERENCES: Record<string, string> = {
  // Empty since T1 stage A (2026-08-31): SAFETY_VENDOR moved to WEB_POSTURE
  // when its unset default stopped being gemini. The bucket stays for the
  // next deliberate divergence, with its reason.
};

// Shipping profiles - the ones that name an EAS environment of the same name.
const PROFILES = ["preview", "production"] as const;

// Every profile that carries the vendor switches. preview-emulator is NOT a
// shipping profile (its `environment` is "preview", so it cannot join PROFILES
// above), but it is the build QA actually installs on the emulator, and a QA
// build whose failover posture differs from the shipped one is testing a
// different app. It was outside every assertion in this file until 2026-08-29.
const VENDOR_PROFILES = ["preview", "preview-emulator", "production"] as const;

describe("the native posture matches the web", () => {
  test.each(VENDOR_PROFILES)("%s carries every vendor switch the web sets", (profile) => {
    const env = EAS.build[profile]?.env ?? {};
    for (const [key, want] of Object.entries(WEB_POSTURE)) {
      expect(`${profile}.${key}=${env[key]}`).toBe(`${profile}.${key}=${want}`);
    }
  });

  test.each(VENDOR_PROFILES)("%s carries the switches the web was asked to match", (profile) => {
    const env = EAS.build[profile]?.env ?? {};
    for (const [key, { want, asked }] of Object.entries(WEB_POSTURE_REQUESTED)) {
      // `asked` rides in the assertion string so the failure names the pending
      // console action instead of just a value mismatch.
      expect(`${profile}.${key}=${env[key]} (${asked})`).toBe(
        `${profile}.${key}=${want} (${asked})`,
      );
    }
  });

  test("the three vendor profiles do not disagree with each other", () => {
    // The APK people install, the APK QA installs on the emulator, and the AAB
    // Play serves must all behave the same.
    const keys = [...Object.keys(WEB_POSTURE), ...Object.keys(WEB_POSTURE_REQUESTED)];
    const [first, ...rest] = VENDOR_PROFILES;
    const a = EAS.build[first]?.env ?? {};
    for (const profile of rest) {
      const b = EAS.build[profile]?.env ?? {};
      for (const key of keys) expect(`${profile}.${key}=${b[key]}`).toBe(`${profile}.${key}=${a[key]}`);
    }
  });

  test("EXPO_PUBLIC_LLM_VENDOR is PRESENT, because absence is not neutral here", () => {
    // Absent falls through to the phase rule, and EXPO_PUBLIC_LLM_PHASE is "1",
    // which resolved gemini for all twelve reasoning seats until T1 stage A
    // (2026-08-31) and resolves RETIRED_DEFAULT (openai) since. Either way
    // "unset" reads like "no opinion" and is actually the strongest possible
    // opinion.
    for (const profile of VENDOR_PROFILES) {
      expect(EAS.build[profile]?.env?.EXPO_PUBLIC_LLM_VENDOR).toBeTruthy();
    }
  });

  test("every divergence from the web list is a named decision", () => {
    // Anything that is neither matched, requested, nor explained is drift.
    const easKeys = new Set(
      VENDOR_PROFILES.flatMap((p) => Object.keys(EAS.build[p]?.env ?? {})).filter((k) =>
        /_VENDOR$|CROSSCHECK$/.test(k),
      ),
    );
    const unexplained = [...easKeys].filter(
      (k) =>
        !(k in WEB_POSTURE) && !(k in WEB_POSTURE_REQUESTED) && !(k in INTENDED_DIFFERENCES),
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

// EXPO_PUBLIC_CLARITY_PROJECT_ID is deliberately NOT committed to eas.json:
// analytics.test.ts pins "release profiles contain no committed analytics
// identifiers", and those ids arrive through the EAS environment named by each
// profile's `environment` field, plus GitHub `vars` for the workflow paths.
//
// It was still missing where it mattered. The repo Variable had existed since
// before native analytics did, and the EAS preview/production environments held
// GA4 and Sentry but no Clarity id at all (measured 2026-08-24). A native
// session-replay SDK with no project id is the worst kind of failure: it
// initializes, records, and uploads nowhere, so absence looks like success.
//
// A test cannot read the EAS environment, so what it can pin is the shape:
// the id belongs to the environment, not the file, and every profile that ships
// must actually name an environment for that to mean anything.
describe("analytics identifiers live in the EAS environment, not in eas.json", () => {
  test("the Clarity id is not committed to any build profile", () => {
    for (const [profile, cfg] of Object.entries(EAS.build)) {
      expect(`${profile}:${"EXPO_PUBLIC_CLARITY_PROJECT_ID" in (cfg.env ?? {})}`).toBe(
        `${profile}:false`,
      );
    }
  });

  test("every shipping profile names the environment that supplies it", () => {
    // Without `environment`, eas build and eas update resolve no server-side
    // variables at all, and the id silently stays undefined.
    for (const profile of PROFILES) {
      expect((EAS.build[profile] as { environment?: string })?.environment).toBe(profile);
    }
  });

  test("the OTA job resolves that environment too", () => {
    // The OTA mirrors eas.json's EXPO_PUBLIC_*, which by design does NOT carry
    // the id. Only --environment brings it into the published bundle.
    expect(read(".github/workflows/eas-update.yml")).toMatch(/--environment "\$CHANNEL"/);
  });

  test("the workflow paths pass it from repo vars", () => {
    for (const wf of [".github/workflows/web-deploy.yml", ".github/workflows/android-release.yml"]) {
      expect(read(wf)).toContain("EXPO_PUBLIC_CLARITY_PROJECT_ID");
    }
  });
});
