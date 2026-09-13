// 요약 + 질문 넷(Phase 1)을 **배송되는 앱에서 부를 수 있는가.**
//
// 2026-09-13 이전에는 부를 수 없었다. 그런데 어떤 검사도 울지 않았다 — 코드는
// 전부 있었기 때문이다:
//
//   `runPhase1` 을 부르는 곳    2군데, **둘 다 죽은 반쪽 안**
//                              (src/app/inbox.tsx · src/app/wiki.tsx)
//   배송 megafile              `listSources`·`generateSourcePage`·`runPhase1` 을
//                              **import 만 하고 한 번도 쓰지 않았다**(152·159·160)
//   eslint no-unused-vars      `warn` 이라 CI 는 초록
//   가져오기 화면 주석          "imported notes land in the inbox for Phase 1/2
//                              later ($0)" — 지킬 수 없는 약속
//
// 즉 "기능이 있다"와 "사용자가 닿을 수 있다"가 갈라져 있었고, 갈라진 자리를
// 아무도 보고 있지 않았다. 이 검사가 그 자리를 본다.
//
// ⚠ 이 파일은 **자기 산문을 증거로 읽지 않는다.** 말뭉치에서 주석을 걷어내고,
// import 문 자체도 걷어낸 뒤에 이름을 찾는다. 그러지 않으면 위 문단이 "호출부가
// 있다"는 증거가 되어 영원히 초록이 된다(이 저장소가 2026-09-08 에 세 번 밟은
// 함정이다).
import fs from "node:fs";
import path from "node:path";

import { deadRendererSpans } from "@/lib/legal/dead-renderer-spans";

const ROOT = process.cwd();

const read = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

/** 주석을 지운다. 지운 자리는 같은 줄 수를 유지해 줄 번호가 안 밀린다. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_m, lead: string) => lead);
}

/**
 * 문자열 리터럴의 **내용**을 지운다(길이·줄 수는 유지).
 *
 * ⚠ 이걸 안 해서 처음에 자가 틀렸다: `console.warn("[inbox] runPhase1 (...) failed")`
 * 가 호출로 세여 죽은 호출부가 2가 아니라 3으로 나왔다. 로그 문구는 호출이
 * 아니다. **자를 먼저 검사할 것** - 이 저장소가 반복해서 밟는 자리다.
 */
function stripStrings(source: string): string {
  return source.replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) =>
    m[0] + m.slice(1, -1).replace(/[^\n]/g, " ") + m[0],
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "__mocks__") walk(rel, out);
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      out.push(rel);
    }
  }
  return out;
}

/** `src/app/*.tsx` 안에서 배송되지 않는 줄. */
function deadLines(): Map<string, Set<number>> {
  const byFile = new Map<string, Set<number>>();
  for (const span of deadRendererSpans(ROOT)) {
    const set = byFile.get(span.file) ?? new Set<number>();
    for (let n = span.from; n <= span.to; n += 1) set.add(n);
    byFile.set(span.file, set);
  }
  return byFile;
}

/** `runPhase1(` 을 실제로 **부르는** 줄. 선언·import·주석은 세지 않는다. */
function callSites(): { file: string; line: number; dead: boolean }[] {
  const dead = deadLines();
  const files = [...walk("src/app"), ...walk("src/screens"), ...walk("src/components"), ...walk("src/lib")];
  const out: { file: string; line: number; dead: boolean }[] = [];
  for (const rel of files) {
    if (rel.startsWith("src/lib/wiki/phase1")) continue; // 정의 자신
    const lines = stripStrings(stripComments(read(rel))).split("\n");
    lines.forEach((text, i) => {
      if (!/\brunPhase1\s*\(/.test(text)) return;
      if (/^\s*(export\s+)?(async\s+)?function\s+runPhase1\b/.test(text)) return;
      out.push({ file: rel, line: i + 1, dead: dead.get(rel)?.has(i + 1) === true });
    });
  }
  return out;
}

/** `@/lib/wiki/...` 에서 가져와 놓고 본문에서 한 번도 안 쓰는 이름. */
function danglingWikiImports(dir: string): string[] {
  const out: string[] = [];
  for (const rel of walk(dir)) {
    const body = stripComments(read(rel));
    const imports = [...body.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](@\/lib\/wiki\/[^"']+)["'];?/g)];
    if (imports.length === 0) continue;
    let rest = body;
    for (const m of imports) rest = rest.replace(m[0], "");
    for (const m of imports) {
      for (const piece of m[1].split(",")) {
        const token = piece.trim().replace(/^type\s+/, "");
        if (token.length === 0) continue;
        const local = /\s+as\s+([A-Za-z0-9_$]+)$/.exec(token);
        const name = local === null ? token : local[1];
        if (!new RegExp(`\\b${name}\\b`).test(rest)) out.push(`${rel}: ${name} <- ${m[2]}`);
      }
    }
  }
  return out;
}

describe("요약 + 질문 넷은 배송되는 앱에서 부를 수 있다", () => {
  const sites = callSites();

  test("스캐너가 실제로 읽었다 - 0건 통과를 막는다", () => {
    // 자를 먼저 검사한다. 죽은 스팬이 하나도 안 나오거나 호출부를 하나도 못
    // 찾으면, 아래 단언들은 "통과" 가 아니라 **아무것도 안 본 것**이다.
    expect(deadRendererSpans(ROOT).length).toBeGreaterThan(0);
    expect(sites.length).toBeGreaterThan(0);
    // 주석 제거기가 실제로 동작하는지도 본다 - 이 검사의 존재 이유다.
    expect(stripComments("// runPhase1(x)\nrunPhase1(y);")).not.toMatch(/\/\/ runPhase1/);
    expect(stripComments("// runPhase1(x)\nrunPhase1(y);")).toMatch(/runPhase1\(y\)/);
    // 문자열 안의 이름은 호출이 아니다. 이걸 안 지우면 로그 문구가 호출로 세인다.
    expect(stripStrings('warn("runPhase1 failed"); runPhase1(y);')).not.toMatch(
      /"runPhase1 failed"/,
    );
    expect(stripStrings('warn("runPhase1 failed"); runPhase1(y);')).toMatch(/runPhase1\(y\)/);
  });

  test("배송되는 줄에서 부르는 곳이 최소 하나 있다", () => {
    const live = sites.filter((s) => !s.dead);
    if (live.length === 0) {
      throw new Error(
        "Phase 1(요약 + 질문 넷)을 배송되는 앱에서 부르는 곳이 없다.\n" +
          "찾은 호출부는 전부 죽은 반쪽 안이다:\n  " +
          sites.map((s) => `${s.file}:${s.line}`).join("\n  ") +
          "\n\n코드가 있다는 것과 사용자가 닿을 수 있다는 것은 다르다.\n" +
          "2026-09-13 이전이 정확히 이 상태였고, 그동안 가져오기 화면은\n" +
          '"나중에 inbox 에서 Phase 1/2 가 돈다" 고 주석으로 약속하고 있었다.',
      );
    }
    expect(live.length).toBeGreaterThan(0);
  });

  test("죽은 반쪽 안의 호출부는 그것대로 남아 있다 - 명세가 흔들리지 않는다", () => {
    // 흔들리면 안 되는 항. 죽은 쪽이 은퇴하면 이 수는 줄고, 그때는 이 줄을
    // 함께 고치면서 **왜 줄었는지**를 적는다. 아무것도 안 세는 검사가 되지
    // 않게 하는 장치다.
    const dead = sites.filter((s) => s.dead).map((s) => `${s.file}:${s.line}`).sort();
    expect(dead).toEqual(["src/app/inbox.tsx:452", "src/app/wiki.tsx:318"]);
  });

  test("배송 화면에 매달린 위키 파이프라인 import 가 없다", () => {
    // 실측 0건. 0 이었던 적이 없다 - 2026-09-13 에 megafile 에서 **열 개**를
    // 걷어내고 0 이 됐다. 셋(listSources · generateSourcePage · runPhase1)은 손으로
    // 찾았고, 나머지 일곱(deleteSource · updateSourceTags · suggestedTags ·
    // captureFromMarkdown · pickImportFiles · splitImportNotes · previewTitle)은
    // **이 검사가 찾아냈다.** 손으로 세면 늘 모자란다.
    // 매달린 import 는 "여기서 그걸 한다" 는 착시를 만들고, eslint 는 warn 이라
    // CI 를 안 세운다.
    expect(danglingWikiImports("src/screens")).toEqual([]);
  });

  test("알림 허브에서 그 자리로 가는 길이 있다", () => {
    // 화면을 만들어 두고 아무도 못 찾으면 만들지 않은 것과 같다.
    const hub = stripComments(read("src/screens/deepspace/dds-import-inbox-screens.tsx"));
    expect(hub).toContain('route: "/sources"');
    expect(hub).toContain("listSources(userId, { ingested: false");
    // 라우트가 실재한다.
    expect(fs.existsSync(path.join(ROOT, "src/app/sources.tsx"))).toBe(true);
    const screen = stripComments(read("src/screens/deepspace/dds-sources-screen.tsx"));
    expect(screen).toMatch(/\brunPhase1\s*\(/);
    expect(screen).toMatch(/\bgenerateSourcePage\s*\(/);
  });
});
