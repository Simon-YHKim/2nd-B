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
// It is a RATCHET, not a zero-tolerance gate: there are 110 of these today and
// fixing them means re-pointing each guard at the shipped screen, which is the
// legacy-retirement work itself (legacy/screens/INDEX.md). The ratchet stops the
// number growing, and makes it fall visibly as routes retire.
import fs from "node:fs";
import path from "node:path";

import { deadRendererSpans, delegationCandidates } from "../../legal/dead-renderer-spans";

const ROOT = process.cwd();

// 2026-09-08 실측. 은퇴가 진행되면 내려간다 - 내려가면 여기도 내려야 한다.
// ⚠ 이 수가 줄어드는 것은 **고쳐서가 아니라 대상이 나가서**일 수 있다. 진척으로
// 읽지 말 것 - check-pixel-rules 의 래칫과 같은 성질이다.
//
// 처음 재봤을 때는 112 였다. deadRendererSpans 가 audit.tsx 를 빼기 때문에 110 이다
// - ?screener=1 이 스킨 검사보다 먼저 와서 그 렌더러는 배송되는 앱에서 닿는다.
// 판정을 공유 모듈 하나로 모은 값어치가 여기서 2건으로 나타난다.
const RATCHET_BASELINE = 110;

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

function bindings(source: string, dead: Map<string, DeadFile>): Map<string, string> {
  const out = new Map<string, string>();
  BIND.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BIND.exec(source)) !== null) {
    const [, name, joinArgs, literal] = m;
    if (literal !== undefined && dead.has(literal)) {
      out.set(name, literal);
      continue;
    }
    if (joinArgs !== undefined) {
      const parts = [...joinArgs.matchAll(/["'`]([^"'`]+)["'`]/g)].map(p => p[1]);
      const guess = parts.join("/");
      if (guess.length === 0) continue;
      for (const route of dead.keys()) {
        if (route.endsWith(guess) || guess.endsWith(route)) out.set(name, route);
      }
    }
  }
  return out;
}

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
    const bound2route = bindings(source, dead);
    if (bound2route.size === 0) continue;
    bound += bound2route.size;

    for (const [name, route] of bound2route) {
      const info = dead.get(route);
      if (!info) continue;
      const assertion = new RegExp(
        `\\b${name}\\s*\\.includes\\(\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1` +
          `|expect\\(\\s*${name}\\s*\\)\\s*\\.toContain\\(\\s*(["'])((?:\\\\.|(?!\\3).)*)\\3`,
        "g",
      );
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = assertion.exec(source)) !== null) {
        const literal = (m[2] ?? m[4] ?? "").replace(/\\(["'\\])/g, "$1");
        if (literal.length < 4 || seen.has(literal)) continue;
        seen.add(literal);
        const total = info.text.split(literal).length - 1;
        if (total === 0) continue; // not in that file at all - a different problem
        const inDead = info.deadText.split(literal).length - 1;
        if (inDead === total) {
          pins.push({ checker, route, component: info.component, literal });
        }
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
    // **위반 없음**이 아니다 - 그 차이를 수로 남긴다.
    const candidates = delegationCandidates(ROOT).length;
    const parsed = deadRendererSpans(ROOT).length;
    expect(candidates).toBeGreaterThanOrEqual(parsed);
    // 이 검사가 덮는 범위가 절반 밑으로 떨어지면 결과를 믿을 수 없다.
    expect(parsed / candidates).toBeGreaterThan(0.4);
  });

  test(`죽은 반쪽에만 있는 핀이 ${RATCHET_BASELINE}건을 넘지 않는다`, () => {
    if (pins.length > RATCHET_BASELINE) {
      const grew = pins.length - RATCHET_BASELINE;
      const byRoute = new Map<string, number>();
      for (const p of pins) byRoute.set(p.route, (byRoute.get(p.route) ?? 0) + 1);
      const worst = [...byRoute].sort((a, b) => b[1] - a[1]).slice(0, 5);
      throw new Error(
        `배송 안 되는 반쪽에만 있는 문자열을 핀으로 박은 곳이 ${grew}건 늘었다 ` +
          `(${RATCHET_BASELINE} -> ${pins.length}).\n` +
          `새 검사를 쓸 때는 라우트 파일이 아니라 **배송되는 화면**을 읽을 것.\n` +
          `가장 많은 곳: ${worst.map(([r, n]) => `${r} ${n}건`).join(" · ")}`,
      );
    }
    if (pins.length < RATCHET_BASELINE) {
      throw new Error(
        `핀이 ${RATCHET_BASELINE - pins.length}건 줄었다 (${RATCHET_BASELINE} -> ${pins.length}). ` +
          `좋은 일이다 - 이 파일의 RATCHET_BASELINE 을 ${pins.length} 로 내리고 다시 올릴 것.\n` +
          `내리지 않으면 다음 사람이 그만큼 되돌려도 안 걸린다.`,
      );
    }
    expect(pins.length).toBe(RATCHET_BASELINE);
  });
});
