import fs from "node:fs";
import path from "node:path";

// `createRecord` runs the C9 classifier on **every** save and reports a red zone
// by RETURNING a fixed-template followup - it never throws for crisis
// (`src/lib/records/create.ts:160-161`). So a screen that discards the created
// record discards the hand-off: the safety ledger is written, `ai_followup` is
// stored on the row, and the user is shown nothing.
//
// This is not hypothetical and it is not new. Two screens already carry the
// scar in their own comments:
//
//   capture.tsx:2497   "this handler used to drop res.followup on the floor
//                       ... a red-zone save wrote the safety ledger and showed
//                       the user NOTHING"
//   northstar.tsx:141  "leaving with a cheerful 'delight' and no hotline is the
//                       gap the map flagged"
//
// Round 61 found four more, all of them screens where the body is text the user
// typed: the life audit, career input, career drilldown, and the North Star
// sentence on the sign-up completion screen.
//
// ⚠ **This test's claim is narrow on purpose.** It does not say every
// `createRecord` caller must show a hotline - most of them save machine-built
// JSON (assessment scores) where crisis text cannot appear, and demanding a
// crisis modal there would make healthy code a violation. It says: **a call site
// whose body is text the user typed must consume the result and check for red.**
// Which sites those are is a judgement, so the judgement is written down here
// rather than guessed by a regex.
const ROOT = process.cwd();

/** Call sites whose `body` is text a person typed. These must surface red. */
const USER_PROSE: readonly string[] = [
  "src/app/call-reflection.tsx",
  "src/app/capture.tsx",
  "src/app/career-drilldown.tsx",
  "src/app/career-input.tsx",
  "src/app/interview.tsx",
  "src/app/northstar.tsx",
  "src/app/(auth)/complete-profile.tsx",
  "src/components/deep-space/DeepSpaceViews.tsx",
];

/** Call sites whose `body` is machine-built, with the reason. Crisis text
 *  cannot appear in a score payload, and requiring a hotline there would be the
 *  checker being broader than its claim. */
const NOT_USER_PROSE: Readonly<Record<string, string>> = {
  "src/app/attachment.tsx": "body 는 JSON.stringify 한 애착 척도 응답이다",
  "src/app/ipip-neo.tsx": "body 는 IPIP-NEO 문항 점수 JSON",
  "src/app/motivation.tsx": "body 는 동기 척도 점수 JSON",
  "src/app/rlss.tsx": "body 는 RLSS 점수 JSON",
  "src/app/strengths.tsx": "body 는 강점 검사 점수 JSON",
  "src/app/values.tsx": "body 는 가치 순위 점수 JSON",
  "src/screens/deepspace/onboarding/TTFVScreen.tsx":
    "body 는 이분 선택(soft/affirm)에 대응하는 **카피 상수**로 조립된다 - 사용자가 타이핑한 문장이 아니다",
};

/** Call sites whose body IS user prose but which no shipped build renders.
 *
 *  ⚠ Round 61 wired `audit.tsx` before checking this, and had to undo it. The
 *  free-text questionnaire there is the LEGACY renderer: `audit.tsx` returns
 *  `<AuditDeepSpace />` when `isDeepSpaceUI()`, that path renders
 *  `DdsAuditScreen`, and `dds-audit-screen.tsx` contains no `createRecord` at
 *  all - the shipped /audit is a provenance hub, not a questionnaire. UI_MODE
 *  defaults to deep-space (`src/lib/ui-mode.ts:31`) and all three delivery
 *  paths set it explicitly, so the questionnaire is unreachable.
 *
 *  This is the same shape as the DPIA's Q-H1 citation (round 60): a real-looking
 *  surface that no deployment draws. Fixing it would have been effort spent on
 *  a screen nobody sees, and it would have broken the byte-stability pin that
 *  keeps the legacy renderer frozen during the migration
 *  (`audit-provenance-screen.test.ts:180`).
 *
 *  The exemption is only valid while that delegation holds - asserted below, so
 *  the day someone makes the questionnaire reachable this file must move up to
 *  USER_PROSE rather than stay quietly exempt. */
const LEGACY_UNREACHABLE: Readonly<Record<string, string>> = {
  "src/app/audit.tsx":
    "자유서술 설문은 레거시 렌더러다 - 배송되는 /audit 는 DdsAuditScreen(provenance hub)이고 createRecord 가 0건이다",
};

const SAVE_CALL = /(?:^|[^.\w])(createRecord|saveNorthstar)\s*\(/;

function screenFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "__mocks__") continue;
      screenFiles(full, out);
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out;
}

const callers = [
  ...screenFiles(path.join(ROOT, "src", "app")),
  ...screenFiles(path.join(ROOT, "src", "screens")),
  ...screenFiles(path.join(ROOT, "src", "components")),
].filter(rel => SAVE_CALL.test(fs.readFileSync(path.join(ROOT, rel), "utf8")));

test("저장 호출부를 실제로 찾았다 - 0건 통과를 막는다", () => {
  expect(callers.length).toBeGreaterThanOrEqual(10);
  expect(callers).toEqual(expect.arrayContaining([...USER_PROSE]));
});

test("모든 저장 호출부가 분류돼 있다 - 새 화면이 조용히 빠져나가지 못한다", () => {
  const unclassified = callers.filter(
    rel =>
      !USER_PROSE.includes(rel) &&
      !(rel in NOT_USER_PROSE) &&
      !(rel in LEGACY_UNREACHABLE),
  );
  expect(unclassified).toEqual([]);
});

test("사용자가 타이핑한 본문을 저장하는 화면은 red 위기 인계를 화면에 올린다", () => {
  const broken: string[] = [];
  for (const rel of USER_PROSE) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (!/followup\?\.zone === "red"/.test(src)) {
      broken.push(`${rel}: 저장 결과의 red 를 보지 않는다`);
      continue;
    }
    if (!/CrisisRouter/.test(src)) {
      broken.push(`${rel}: red 를 보지만 CrisisRouter 를 그리지 않는다`);
    }
  }
  expect(broken).toEqual([]);
});

test("미성년 여부가 저장 호출에 실린다 - 1388 과 109 를 가르는 값이다", () => {
  // `classifyRecordTextForCrisis(..., args.minor === true)` picks the youth line.
  // A caller that omits `minor` resolves a 14-17 user's red zone to the ADULT
  // hotline, which is exactly the one minor-specific behaviour this product has.
  const missing: string[] = [];
  for (const rel of USER_PROSE) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (!/minor:\s*(isMinor|isMinorAge)/.test(src)) {
      missing.push(`${rel}: 저장 호출에 minor 를 안 넘긴다`);
    }
  }
  expect(missing).toEqual([]);
});

test("도달 불가 면제가 아직 지킬 대상을 갖는다", () => {
  // 면제는 근거가 살아 있을 때만 면제다. audit.tsx 가 딥스페이스로 위임하기를
  // 멈추면 그 설문은 다시 그려지고, 그 순간 이 파일은 USER_PROSE 로 올라와야
  // 한다. 근거를 검사하지 않는 면제는 조용히 썩는다.
  const app = fs.readFileSync(path.join(ROOT, "src/app/audit.tsx"), "utf8");
  expect(app).toMatch(/if \(isDeepSpaceUI\(\)\) return <AuditDeepSpace \/>;/);
  const dds = fs.readFileSync(
    path.join(ROOT, "src/screens/deepspace/dds-audit-screen.tsx"),
    "utf8",
  );
  expect(SAVE_CALL.test(dds)).toBe(false);
});
