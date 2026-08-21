// Every REQUIRED consent ack must have a visible row on the sign-up screen the
// user actually sees.
//
// WHAT WENT WRONG. src/app/(auth)/sign-up.tsx ends with
//
//     if (isDeepSpaceUI()) return <DeepSpaceSignUpDesignScreen />;
//     return <SignUpLegacy />;
//
// and isDeepSpaceUI() is true unless EXPO_PUBLIC_UI=legacy. So SignUpLegacy -
// which renders <ConsentNotice/>, which has all five required rows - is NOT what
// ships. The live screen is DeepSpaceConsentBlock in dds-auth-screens.tsx, and
// it rendered only four: service, llmProcessing, overseasTransfer,
// sensitiveData. safetyNotice had no row.
//
// That is the repo's own recorded trap ("라우트가 셸로 조기 반환"): reading the
// component that LOOKS like the sign-up screen tells you nothing about what
// renders. Measured on the live site 2026-08-20: the ko label for ackSafety
// ("위기 문구가 보이면 상담 창구를 안내하고...") was absent from the deployed DOM
// while its siblings were present.
//
// WHY IT MATTERED, BOTH WAYS.
//   - Tick the four visible rows one by one: allRequiredAcksChecked still wants
//     safetyNotice, so the submit button never enables and nothing on screen
//     explains why.
//   - Tap "필수 항목에 모두 동의": setAllRequiredAcks writes safetyNotice = true
//     into the C10 consent ledger for an item the user was never shown. For a
//     PIPA 제23조 별도 동의 item, "shown separately and agreed separately" is the
//     whole requirement, so a recorded consent nobody saw is worse than a
//     missing one.
//
// This test pins the invariant rather than the one bug: every key in
// REQUIRED_ACK_KEYS needs its own row in the block that actually ships.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REQUIRED_ACK_KEYS } from "../consent-selections";

const SRC = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8").replace(/\r\n/g, "\n");

const deepSpace = read("screens/deepspace/dds-auth-screens.tsx");
const legacy = read("components/consent/ConsentNotice.tsx");
const route = read("app/(auth)/sign-up.tsx");

describe("the deep-space block is the one that ships", () => {
  test("the route early-returns the deep-space screen", () => {
    // If this ever flips, the assertions below are pointed at the wrong file and
    // the test becomes a rubber stamp.
    expect(route).toMatch(/if \(isDeepSpaceUI\(\)\) return <DeepSpaceSignUpDesignScreen \/>;/);
    expect(route).toMatch(/return <SignUpLegacy \/>;/);
  });

  test("and the legacy screen still renders the same consent component", () => {
    expect(route).toMatch(/<ConsentNotice /);
  });
});

describe("every required ack has a row a user can see and tick", () => {
  test.each(REQUIRED_ACK_KEYS)("%s has its own row in the shipped block", (key) => {
    // The row must read AND write that exact key: a row bound to the wrong key
    // would look right on screen and still leave the gate unsatisfiable.
    expect(deepSpace).toContain(`checked={value.${key}}`);
    expect(deepSpace).toContain(`onToggle={() => toggle("${key}")}`);
  });

  test.each(REQUIRED_ACK_KEYS)("%s also has one in the legacy component", (key) => {
    expect(legacy).toContain(`toggle("${key}")`);
  });

  test("the shipped block has exactly one row per required ack, plus the master and marketing", () => {
    const rows = deepSpace.match(/<ConsentCheckRow /g) ?? [];
    // required rows + "필수 항목에 모두 동의" + the optional marketing row
    expect(rows).toHaveLength(REQUIRED_ACK_KEYS.length + 2);
  });
});

describe("the master toggle cannot record what was never shown", () => {
  test("agree-all writes exactly the keys that have rows", () => {
    // setAllRequiredAcks sets every REQUIRED_ACK_KEYS entry. That is only honest
    // while each of those has a visible row - which the test above enforces.
    expect(deepSpace).toMatch(/onToggle=\{\(\) => onChange\(setAllRequiredAcks\(value, !allChecked\)\)\}/);
  });

  test("safetyNotice is genuinely required, not optional", () => {
    // If it were dropped from REQUIRED_ACK_KEYS instead of given a row, the
    // per-key tests above would pass while the 별도 동의 vanished. Pin it.
    expect(REQUIRED_ACK_KEYS).toContain("safetyNotice");
  });
});

describe("the copy the row needs exists in every locale", () => {
  const LOCALES = ["en", "ko", "es", "id", "pt"] as const;

  test.each(LOCALES)("%s has notice.ackSafety and detail.safetyNotice", (locale) => {
    const raw = readFileSync(join(SRC, "..", "locales", locale, "consent.json"), "utf8");
    const j = JSON.parse(raw);
    const notice = j.consent?.notice ?? j.notice;
    const detail = j.consent?.detail ?? j.detail;
    expect(typeof notice?.ackSafety).toBe("string");
    expect(notice.ackSafety.length).toBeGreaterThan(0);
    // The row's chevron opens /consent-notice for this item; without the detail
    // entry the accessibility label would read as "undefined".
    expect(detail?.safetyNotice).toBeTruthy();
  });
});
