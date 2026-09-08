// A guard that pins a string which only exists in a dead renderer passes
// forever and protects nothing.
//
// `legal-citations-not-in-dead-renderers` found this shape in legal documents.
// This is the same shape one layer over: our own checks and contract tests read
// `src/app/<route>.tsx` and assert strings that live in the half no build draws.
// Four came out on 2026-09-08, all of them green until the renderer was moved:
//
//   focus-refetch-contract      asserted `useFocusRefetch(` against
//                               src/app/insights.tsx. It was there - inside the
//                               legacy branch. The shipped screen never
//                               refreshed on focus, so a user who captured a
//                               record and came back read last week's numbers.
//   untrusted                   listed src/app/import.tsx as an import_ingest
//                               fence surface. That caller only ever existed in
//                               the legacy renderer.
//   android-elevation-coverage  required 2 card elevations in
//                               src/app/research.tsx; both were legacy styles.
//   A11y                        pinned framework-chip tablist markup for a UI
//                               the shipped /research does not have.
//
// ⚠ This test does NOT say those guards were wrong to exist, and it does not say
// the thing they assert is unimportant. It says one thing: the assertion is
// being made against a copy of the code no build runs, so passing it is not
// evidence about the app anyone uses.
//
// It is a RATCHET, not a zero-tolerance gate: there are 103 of these today and
// fixing them means re-pointing each guard at the shipped screen, which is the
// legacy-retirement work itself (legacy/screens/INDEX.md). The ratchet stops the
// number growing, and makes it fall visibly as routes retire.
import fs from "node:fs";
import path from "node:path";

import { deadRendererSpans, delegationCandidates } from "../../legal/dead-renderer-spans";

const ROOT = process.cwd();

// 2026-09-08 실측. 은퇴가 진행되면 내려간다 - 내려가면 여기도 내려야 한다.
//
// ⚠ **수 하나가 아니라 라우트별 명세다.** 처음에는 `= 103` 한 줄이었는데, 그러면
// 줄어든 이유를 사람이 주석으로 적어야 했다: 대상 파일이 은퇴해서 함께 나간 것인지,
// 가드를 배송 화면으로 다시 겨눠서 진짜로 준 것인지. **둘은 전혀 다른 일인데 같은
// 숫자로 보인다.** 라우트별로 적으면 감소분이 어느 쪽인지 검사가 직접 말한다.
//
// 처음 재봤을 때는 112 였다. deadRendererSpans 가 audit.tsx 를 빼서 110 이 됐다
// (?screener=1 이 스킨 검사보다 먼저 와서 그 렌더러는 배송되는 앱에서 닿는다).
// ⚠ 그 판정은 모듈이 처음부터 더 엄격해서 생긴 게 아니다 - 회차 61 이 audit 을
// 죽었다고 오판해 진짜 안전 수정을 되돌린 뒤, 그 대가로 붙인 조건이다.
// 그 다음 /account 은퇴로 7건이 함께 나가 103 이 됐고, records·review 은퇴로 5건이
// 더 나가 98, sign-up 은퇴로 11건 더 나가 87, profile 은퇴로 7건 더 나가 80 이 됐다.
// **전부 대상이 나간 것이다** — 검사가 그 구분을 직접 말한다. **전부 대상이 나간 것이지 고친 것이 아니다** — 이제 그 구분을
// 검사가 직접 말한다(감소가 어느 양동이인지).
const RATCHET_BASELINE: Readonly<Record<string, number>> = {
  "src/app/wiki.tsx": 29,
  // 0 = 라우트는 아직 죽은 반쪽을 품고 있지만 검사가 더는 그쪽을 안 읽는다.
  // 은퇴(Q6 결정 후)하면 이 줄을 지운다 - 그건 [대상이 나갔다] 양동이다.
  "src/app/record/[id].tsx": 0,
  "src/app/inbox.tsx": 8,
  "src/app/manual.tsx": 7,
  "src/app/data.tsx": 6,
  "src/app/privacy.tsx": 2,
};

/**
 * ⚠ 2026-09-08: 여기 record/[id] 가 **4** 로 적혀 있었다. 실제로는 9 다.
 *
 * 옛 스캐너는 파일마다 `Map<이름, 라우트>` 하나를 만들어 **마지막 바인딩이 파일
 * 전체를 먹었다**(위 bindingEvents 주석). check-constraints.ts 에서 `screen` 의
 * 마지막 바인딩이 sign-in 이었으므로, 2319 줄에서 record/[id] 로 묶은 `screen` 의
 * 핀 5개가 sign-in 파일에 대고 검사됐고 - 거기 없으니 - **아무 라우트에도 안 세이고
 * 조용히 사라졌다.** 옮겨간 게 아니라 빠졌다.
 *
 * 실측(고친 자, origin/main): wiki 29 · sign-in 24 · record/[id] 9 · inbox 8 ·
 * manual 7 · data 6 · privacy 2 = **85**. 옛 자로는 80 이었다. 이 PR 이 sign-in 의
 * 24 를 배송 화면으로 옮겨 61 이 된다.
 *
 * 교훈은 수가 아니다: **총계가 맞아 보이면 귀속이 틀려도 아무도 안 죽는다.**
 */

const BASELINE_TOTAL = Object.values(RATCHET_BASELINE).reduce((a, b) => a + b, 0);

/**
 * ⚠ 이 수는 **아래로 새는 쪽으로 틀린다.** 스팬은 함수 본문만 덮으므로, 죽은
 * 반쪽만 쓰는 **모듈 최상단 선언**은 살아 있는 것으로 세인다. 2026-09-08 에
 * index.tsx 를 은퇴시키며 실측한 예 — GraphScreen 하나만 쓰던 최상단 선언이
 * 열여섯 개였고(useSkyDrift · pickInsight · FIRST_PIECE_INSIGHT · styles …)
 * 이 검사는 그중 **하나도** 세지 못했다. 정의가 스팬 밖이기 때문이다.
 *
 * 그래서 은퇴할 때 "핀 N건"만 보고 옮기면 최상단 선언이 남는다. 읽어서 찾아야
 * 하는 몫이 있다는 뜻이고, 이 수는 그 몫을 포함하지 않는다.
 */

interface DeadFile {
  text: string;
  deadText: string;
  component: string;
}

/** route path -> its text and the slice no build draws */
function deadFiles(): Map<string, DeadFile> {
  const out = new Map<string, DeadFile>();
  for (const span of deadRendererSpans(ROOT)) {
    const text = fs.readFileSync(path.join(ROOT, span.file), "utf8").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    out.set(span.file, {
      text,
      deadText: lines.slice(span.from - 1, span.to).join("\n"),
      component: span.component,
    });
  }
  return out;
}

/** Every `scripts/*` and `__tests__/*` source file - the checks themselves. */
function checkerFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      checkerFiles(full, out);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (rel.startsWith("scripts/") || rel.includes("__tests__/")) out.push(rel);
    }
  }
  return out;
}

/**
 * `const research = read("src/app/research.tsx")` -> research
 *
 * The binding matters. A first pass matched every literal in a checker against
 * every route it mentioned anywhere, and check-constraints.ts mentions dozens -
 * so `accessibilityRole="alert"` asserted about a premium component counted as a
 * pin on sign-in.tsx. That reported 299. Following the variable reports 110.
 */
const BIND =
  /const\s+(\w+)\s*=\s*(?:read|readProjectFile|readFileSync)\(\s*(?:join\(([^)]*)\)|["'`]([^"'`]+)["'`])/g;

interface Binding {
  name: string;
  /** 그 시점에 이 이름이 읽는 파일. 죽은 라우트가 아닐 수도 있다 - 그게 요점이다. */
  file: string;
  at: number;
}

/**
 * ⚠ 2026-09-08: 여기 `Map<이름, 라우트>` 하나를 파일마다 만들고 있었다. 그러면
 * **같은 이름의 마지막 바인딩이 파일 전체를 먹는다.** check-constraints.ts 는
 * `screen` 을 40번 넘게 다시 묶으므로, 어느 블록에서 쓴 핀이든 파일 맨 아래
 * 바인딩의 라우트로 귀속됐다.
 *
 * 총계는 맞고 **라우트별 수만 틀렸다** - 그래서 아무도 안 죽고 조용했다.
 * 실측: /sign-in 24 · record/[id] 4 로 보이던 것이 실제로는 record/[id] 의 핀 5개가
 * sign-in 으로 넘어가 있던 것이었다. 라우트별 수가 틀리면 "이 라우트를 은퇴시켜도
 * 되나"에 답할 수 없다.
 *
 * 그래서 바인딩을 **위치와 함께** 모으고, 단언 하나하나에 대해 그 앞의 가장 가까운
 * 바인딩을 찾는다. 살아 있는 파일로 다시 묶은 것도 기록해야 이름이 제대로 풀린다.
 */
function bindingEvents(source: string): Binding[] {
  const out: Binding[] = [];
  BIND.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BIND.exec(source)) !== null) {
    const [, name, joinArgs, literal] = m;
    let file: string | null = literal ?? null;
    if (file === null && joinArgs !== undefined) {
      const parts = [...joinArgs.matchAll(/["'`]([^"'`]+)["'`]/g)].map(part => part[1]);
      file = parts.join("/") || null;
    }
    if (file !== null) out.push({ name, file, at: m.index });
  }
  return out;
}

/** 이 위치에서 그 이름이 읽고 있는 파일. 앞선 바인딩이 없으면 null. */
function fileAt(events: readonly Binding[], name: string, at: number): string | null {
  let found: string | null = null;
  for (const event of events) {
    if (event.at > at) break; // 바인딩은 소스 순서다
    if (event.name === name) found = event.file;
  }
  return found;
}

/** 읽고 있는 파일이 죽은 스팬을 가진 라우트인가. join(...) 조각은 접미사로 맞춘다. */
function toDeadRoute(file: string, dead: Map<string, DeadFile>): string | null {
  if (dead.has(file)) return file;
  for (const route of dead.keys()) {
    if (route.endsWith(file) || file.endsWith(route)) return route;
  }
  return null;
}

/** `name.includes("...")` 와 `expect(name).toContain("...")` 를 한 번에 훑는다. */
const ASSERTION =
  /\b(\w+)\s*\.includes\(\s*(["'])((?:\\.|(?!\2).)*)\2|expect\(\s*(\w+)\s*\)\s*\.toContain\(\s*(["'])((?:\\.|(?!\5).)*)\5/g;

interface Pin {
  checker: string;
  route: string;
  component: string;
  literal: string;
}

function deadPins(): { pins: Pin[]; scanned: number; bound: number } {
  const dead = deadFiles();
  const checkers = [
    ...checkerFiles(path.join(ROOT, "scripts")),
    ...checkerFiles(path.join(ROOT, "src")),
  ];
  const pins: Pin[] = [];
  let bound = 0;

  for (const checker of checkers) {
    const source = fs.readFileSync(path.join(ROOT, checker), "utf8").replace(/\r\n?/g, "\n");
    const events = bindingEvents(source);
    if (events.length === 0) continue;
    bound += new Set(
      events.filter(event => toDeadRoute(event.file, dead) !== null).map(event => event.name),
    ).size;

    const seen = new Set<string>();
    ASSERTION.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASSERTION.exec(source)) !== null) {
      const name = m[1] ?? m[4];
      const literal = (m[3] ?? m[6] ?? "").replace(/\\(["'\\])/g, "$1");
      if (name === undefined || literal.length < 4) continue;
      const file = fileAt(events, name, m.index);
      if (file === null) continue;
      const route = toDeadRoute(file, dead);
      if (route === null) continue;
      const info = dead.get(route);
      if (!info) continue;
      const key = `${route}|${literal}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const total = info.text.split(literal).length - 1;
      if (total === 0) continue; // not in that file at all - a different problem
      const inDead = info.deadText.split(literal).length - 1;
      if (inDead === total) {
        pins.push({ checker, route, component: info.component, literal });
      }
    }
  }
  return { pins, scanned: checkers.length, bound };
}

describe("검사가 배송되는 반쪽을 보는가", () => {
  const { pins, scanned, bound } = deadPins();

  test("스캐너가 실제로 무언가를 읽었다 - 0건 통과를 막는다", () => {
    // 세 개가 전부 살아 있어야 결과가 뜻을 갖는다. 하나라도 0이면 "위반 0건"과
    // "아무것도 안 봤다"가 구분되지 않는다.
    expect(deadRendererSpans(ROOT).length).toBeGreaterThanOrEqual(5);
    expect(scanned).toBeGreaterThan(100);
    expect(bound).toBeGreaterThanOrEqual(5);
  });

  test("스캐너가 못 읽는 위임 모양을 숨기지 않는다", () => {
    // deadRendererSpans 는 한 가지 모양만 파싱한다. 나머지는 **적용 밖**이지
    // **위반 없음**이 아니다.
    //
    // ⚠ 2026-09-08: 여기 `parsed / candidates > 0.4` 가 있었다. **그 수는 은퇴할
    // 때마다 내려간다** — 파싱되던 스팬은 아카이브로 나가서 사라지는데, 스킨 플래그를
    // 언급만 하는 파일(토큰 전환·조각 분기)은 그대로 남기 때문이다. sign-in 을
    // 은퇴시키자 정확히 0.4 로 떨어져서 **자기가 돕는 일을 자기가 막았다.**
    //
    // 그리고 애초에 중복이었다. 진짜 커버리지 보장은
    // legal-citations-not-in-dead-renderers 의 NOT_A_DEAD_SPAN 이 진다 — 후보마다
    // "파싱됐거나, 왜 아닌지 적혀 있다"를 요구하고, 새 모양이 생기면 즉시 실패한다.
    // 비율은 그것의 흐릿한 사본이었을 뿐이라 걷어낸다. 같은 것을 두 곳에서 주장하면
    // 약한 쪽이 먼저 거짓말한다.
    //
    // 여기 남기는 것은 두 수의 **관계**뿐이다 - 파싱이 후보보다 많으면 둘 중 하나가
    // 다른 것을 세고 있다는 뜻이다.
    const candidates = delegationCandidates(ROOT).length;
    const parsed = deadRendererSpans(ROOT).length;
    expect(candidates).toBeGreaterThanOrEqual(parsed);
    expect(parsed).toBeGreaterThan(0);
  });

  test(`죽은 반쪽에만 있는 핀이 ${BASELINE_TOTAL}건을 넘지 않는다`, () => {
    const actual = new Map<string, number>();
    for (const p of pins) actual.set(p.route, (actual.get(p.route) ?? 0) + 1);
    // 아직 죽은 스팬으로 남아 있는 라우트. 감소가 어느 양동이인지를 이것이 가른다.
    const stillDead = new Set(deadRendererSpans(ROOT).map(span => span.file));

    const grew: string[] = [];
    /** 대상 파일이 은퇴해서 핀이 함께 나갔다 - 고친 것이 아니다. */
    const wentWithTheFile: string[] = [];
    /** 대상은 그대로인데 핀이 줄었다 - 가드를 배송 화면으로 다시 겨눴다. */
    const rePointed: string[] = [];

    for (const [route, base] of Object.entries(RATCHET_BASELINE)) {
      const now = actual.get(route) ?? 0;
      if (now > base) grew.push(`${route} ${base} -> ${now}`);
      else if (now < base) {
        (stillDead.has(route) ? rePointed : wentWithTheFile).push(`${route} ${base} -> ${now}`);
      }
    }
    for (const [route, now] of actual) {
      if (!(route in RATCHET_BASELINE)) grew.push(`${route} (명세에 없음) 0 -> ${now}`);
    }

    if (grew.length > 0) {
      throw new Error(
        `배송 안 되는 반쪽에만 있는 문자열을 핀으로 박은 곳이 늘었다:\n  ` +
          grew.join("\n  ") +
          `\n새 검사를 쓸 때는 라우트 파일이 아니라 **배송되는 화면**을 읽을 것.\n` +
          `⚠ 다만 원인이 셋이다. 올리기 전에 어느 쪽인지 먼저 가릴 것:\n` +
          `  1) 새 핀을 죽은 반쪽에 박았다        -> 검사를 배송 화면으로 겨눈다\n` +
          `  2) 죽은 스팬이 넓어졌다              -> 그 라우트에 레거시가 늘었다\n` +
          `  3) 탐지기가 좋아져서 보이게 됐다      -> 진척도 회귀도 아니다.\n` +
          `     수를 올리되 **왜 올렸는지 그 줄 옆에 적는다.** 안 적으면 다음 사람은\n` +
          `     후퇴로 읽는다(2026-09-08 index.tsx 9건이 이 경우였다).`,
      );
    }
    if (wentWithTheFile.length > 0 || rePointed.length > 0) {
      const lines: string[] = [`핀이 줄었다. 명세를 갱신하고 다시 올릴 것.`];
      if (wentWithTheFile.length > 0) {
        lines.push(
          `\n[대상이 나갔다 - 고친 것이 아니다] 이 라우트들은 legacy/ 로 은퇴했다:`,
          `  ` + wentWithTheFile.join("\n  "),
          `  → 명세에서 그 줄을 지운다. 이 감소를 진척으로 세지 말 것.`,
        );
      }
      if (rePointed.length > 0) {
        lines.push(
          `\n[진짜로 줄었다] 대상은 그대로인데 핀이 배송 화면으로 옮겨갔다:`,
          `  ` + rePointed.join("\n  "),
          `  → 명세의 수를 내린다. 이건 진척이다.`,
        );
      }
      throw new Error(lines.join("\n"));
    }

    expect(pins.length).toBe(BASELINE_TOTAL);
  });
});
