// Which parts of `src/app/*.tsx` no shipped build draws.
//
// The shape is always the same:
//
//   if (isDeepSpaceUI()) return <TheShippedScreen />;
//   return <TheLegacyOne />;
//
// `UI_MODE` defaults to "deep-space" (src/lib/ui-mode.ts) and every delivery
// path sets it explicitly, so the second branch needs an operator to opt in with
// EXPO_PUBLIC_UI=legacy. Nothing ships that way, and the legacy component is
// therefore unreachable in practice.
//
// This module exists because two different guards need the same computation and
// found the same class independently:
//
//   legal citations       a legal document must not point a reader at a copy of
//                         the code no build runs (rounds 60/61/63 — three
//                         instances, each found by accident before this existed)
//   test/guard pins       a check that pins a symbol inside a dead span passes
//                         forever without guarding anything (ttl-work-b6's
//                         focus-refetch, untrusted, elevation and a11y pins)
//
// Extracted at ttl-work-b6's request so the second one can be built on the first
// rather than beside it.
import fs from "node:fs";
import path from "node:path";

/** 코드를 그리지 않고 **설명하는** 파일. 도달성 증거에서 뺀다. */
const SPEAKS_ABOUT_CODE = /(^|\/)(__tests__|__mocks__)\//;

/** `if (isDeepSpaceUI()) return <X />;` immediately followed by `return <Legacy />;` */
export const DELEGATION = /if \(isDeepSpaceUI\(\)\) return <\w+ \/>;\s*\r?\n\s*return <(\w+) \/>;/;

export interface DeadSpan {
  /** Repo-relative path, forward slashes. */
  file: string;
  /** The component that only renders under EXPO_PUBLIC_UI=legacy. */
  component: string;
  /** 1-based, inclusive. */
  from: number;
  to: number;
}

/**
 * Line span of a top-level `function Name(` up to its column-0 closing brace.
 *
 * Deliberately naive: this repo formats top-level declarations with the closing
 * brace in column 0, and a brace counter would have to understand strings,
 * template literals and JSX to do better. If the formatting convention ever
 * changes this returns null and the caller reports "no span" rather than a wrong
 * one — a checker that cannot see should say so, not guess.
 *
 * ⚠ 2026-09-08: `export function Name(` 도 받는다. 그 전에는 `function Name(` 로
 * 시작하는 줄만 찾아서 **index.tsx 가 통째로 안 보였다** — 위임 모양은 교과서적인데
 * (`if (isDeepSpaceUI()) return <DeepSpaceShell />;` 다음 줄에 `return <GraphScreen />;`)
 * 선언이 `export function GraphScreen()` 이라 접두사에서 빗나갔다. 이 구멍은
 * 정규식이 아니라 **선언 한 단어** 때문이었고, 그동안 면제 명단에는 "bare return 이
 * 없다"는 틀린 사유로 적혀 있었다. 못 읽는 이유를 적을 때는 읽어보고 적을 것.
 */
export function topLevelSpan(
  lines: readonly string[],
  name: string,
): { from: number; to: number } | null {
  const start = lines.findIndex(
    l => l.startsWith(`function ${name}(`) || l.startsWith(`export function ${name}(`),
  );
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === "}") return { from: start + 1, to: i + 1 };
  }
  return null;
}

function tsxFiles(dir: string, root: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "__mocks__") continue;
      tsxFiles(full, root, out);
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/** Every legacy-only component span under `src/app`, with its file and name.
 *
 *  ⚠ A component is dead only when EVERY `return <Name />` for it is the
 *  delegation fallback. `audit.tsx` is why this check exists:
 *
 *      550   if (screener === "1") return <AuditLegacy />;   <-- escape hatch
 *      551   if (isDeepSpaceUI()) return <AuditDeepSpace />;
 *      552   return <AuditLegacy />;                          <-- fallback
 *
 *  Line 550 runs BEFORE the skin check, so `/audit?screener=1` reaches the
 *  legacy questionnaire in every build. Round 61 read only the delegation, called
 *  the questionnaire unreachable, and reverted a real crisis-hand-off fix on that
 *  basis. Matching one shape and stopping is how a checker ends up confidently
 *  wrong. */
export function deadRendererSpans(root: string): DeadSpan[] {
  const spans: DeadSpan[] = [];
  let corpus: readonly { rel: string; text: string }[] | null = null;

  /** 그 이름을 정의 파일 **밖에서** 부르는 곳이 있는가.
   *
   *  audit.tsx 교훈의 파일 밖 판본이다. 같은 파일 안에서 `return <X />` 가 하나뿐이어도
   *  `export` 된 컴포넌트는 남이 그릴 수 있다. 파일 안만 보고 죽었다고 하면, 내보낸
   *  컴포넌트를 은퇴시키는 순간 그리던 화면이 빈다.
   *
   *  **한 방향으로만 쓴다.** "이름이 아무 데도 없다"는 튼튼하고, "이름이 있으니
   *  쓰인다"는 아니다 — 재수출은 소비자 없이도 이름을 남긴다(ttl-work-45 의
   *  DeepSpaceSignUpDesignScreen 이 그 반례였다). 그래서 이 함수는 **살아 있다고
   *  볼 쪽으로** 틀린다. 반대로 틀리면 살아 있는 화면을 은퇴시킨다.
   *
   *  ⚠ 말뭉치는 **배송 코드만** 이다: 검사(`__tests__`/`__mocks__`)와 분석 모듈
   *  (`src/lib/legal/`)을 뺀다. 묻는 것이 "무엇이 이걸 **그리는가**" 이고, 그 둘은
   *  코드를 그리지 않고 **설명**하기 때문이다.
   *
   *  그냥 고른 경계가 아니다. 2026-09-08 에 같은 함정을 **두 번** 밟았다: 이 파서를
   *  고치면서 주석에 `GraphScreen` 을 적었더니 검사가 자기 산문을 증거로 읽어
   *  "누가 쓰고 있다"고 답했고, 그걸 legal/ 제외로 막자 이번엔 래칫 테스트에 적은
   *  설명이 같은 일을 했다. **산문은 계속 증거 자격을 얻는다.** 이름을 적는 것만으로
   *  대상이 살아나면 그 검사는 아무 말도 안 하는 것과 같다.
   *
   *  (이 저장소에서 검사를 빼는 것이 안전한 이유가 하나 더 있다 - 컴포넌트 렌더
   *  테스트가 RN 0.85 upstream 문제로 막혀 있어서 테스트가 화면을 그리지 않는다.
   *  그게 풀리면 이 경계를 다시 재야 한다.)
   *
   *  곁들여 배운 것: 이걸 확인하려던 셸 스크립트가 heredoc 에서 백슬래시를 잃어
   *  `\\b` 가 죽는 바람에 "참조 0건" 이라는 **거짓 안심**을 줬다. 자를 먼저 검사할 것. */
  const namedElsewhere = (name: string, home: string): boolean => {
    if (corpus === null) {
      // home 은 여기서 거르지 않는다 - 말뭉치는 호출 사이에 재사용되고, 호출마다
      // home 이 다르다. 파일별 제외는 아래 some() 이 한다.
      corpus = allSources(path.join(root, "src"), root)
        .filter(rel => !rel.startsWith("src/lib/legal/") && !SPEAKS_ABOUT_CODE.test(rel))
        .map(rel => ({ rel, text: fs.readFileSync(path.join(root, rel), "utf8") }));
    }
    const word = new RegExp(`\\b${name}\\b`);
    return corpus.some(f => f.rel !== home && word.test(f.text));
  };

  for (const rel of tsxFiles(path.join(root, "src", "app"), root)) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    const match = DELEGATION.exec(text);
    if (!match) continue;
    const component = match[1];
    const returns = text.match(new RegExp(`return <${component} />;`, "g")) ?? [];
    if (returns.length !== 1) continue; // reachable some other way
    const lines = text.split(/\r?\n/);
    const exported = lines.some(l => l.startsWith(`export function ${component}(`));
    if (exported && namedElsewhere(component, rel)) continue; // 남이 그린다
    const span = topLevelSpan(lines, component);
    if (span) spans.push({ file: rel, component, ...span });
  }
  return spans;
}

/** `src` 아래 모든 ts/tsx. 테스트도 포함한다 - 이름을 부르는 곳을 찾는 용도라
 *  좁히면 "아무 데도 없다"가 조용히 참이 된다. */
function allSources(dir: string, root: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      allSources(full, root, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return out;
}

/** Files under `src/app` that branch on the skin at all — the input this module
 *  claims to cover. Reported separately so a delegation shape the regex cannot
 *  parse shows up as a gap instead of silently shrinking the result. */
export function delegationCandidates(root: string): string[] {
  return tsxFiles(path.join(root, "src", "app"), root).filter(rel =>
    fs.readFileSync(path.join(root, rel), "utf8").includes("isDeepSpaceUI"),
  );
}
