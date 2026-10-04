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

import { duplicatedComponentNames } from "@/lib/legal/shadow-screens";

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

// ⚠ 2026-10-05: 여기 있던 deadLines()(죽은 반쪽 줄 계산, dead-renderer-spans 판정기)를
// 걷었다. 롤백 레버 EXPO_PUBLIC_UI 가 없어져(Simon 결정 Q-261004-11 C) 라우트 파일에
// "어느 빌드도 안 그리는 반쪽"이 더는 없다 - 판정기는 빈 결과만 내게 됐고 E:/Legacy/2ndB
// 로 은퇴했다. 그래서 src 안의 호출부는 이제 전부 배송 코드다. 옛 죽은 반쪽 둘
// (inbox · wiki)은 빌드 밖 legacy/screens/ 의 되살리기 원본이 됐고, 이 스캐너는 src 만 읽는다.

/** `runPhase1(` 을 실제로 **부르는** 줄. 선언·import·주석은 세지 않는다. */
function callSites(): { file: string; line: number }[] {
  const files = [...walk("src/app"), ...walk("src/screens"), ...walk("src/components"), ...walk("src/lib")];
  const out: { file: string; line: number }[] = [];
  for (const rel of files) {
    if (rel.startsWith("src/lib/wiki/phase1")) continue; // 정의 자신
    const lines = stripStrings(stripComments(read(rel))).split("\n");
    lines.forEach((text, i) => {
      if (!/\brunPhase1\s*\(/.test(text)) return;
      if (/^\s*(export\s+)?(async\s+)?function\s+runPhase1\b/.test(text)) return;
      out.push({ file: rel, line: i + 1 });
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
    // 자를 먼저 검사한다. 호출부를 하나도 못 찾으면, 아래 단언들은 "통과" 가
    // 아니라 **아무것도 안 본 것**이다.
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
    // src 안에는 이제 배송 코드만 있다(위 2026-10-05 주석). 그래도 어느 화면이
    // 부르는지를 이름으로 단언한다 - 2026-09-13 이전에는 코드가 다 있는데 사용자가
    // 닿을 길이 0 이었고, 그동안 가져오기 화면은 "나중에 inbox 에서 Phase 1/2 가
    // 돈다" 고 주석으로 약속하고 있었다.
    expect(sites.map((s) => s.file)).toContain("src/screens/deepspace/dds-sources-screen.tsx");
  });

  test("옛 죽은 반쪽의 호출부 둘은 레버와 함께 나갔다 - 라우트 래퍼는 부르지 않는다", () => {
    // 2026-10-04 까지 이 자리는 ["src/app/inbox.tsx:452", "src/app/wiki.tsx:318"] 을
    // 기대했다(어느 빌드도 안 그리던 반쪽 안의 호출). 레버가 없어지며 두 라우트는
    // 배송 화면 하나만 그리는 래퍼가 됐다. 여기서 다시 호출이 보이면 되살리기 원본을
    // 라우트로 되돌린 것이다 - 그때는 배송 /sources 와 겹치는지부터 본다.
    const inRoutes = sites.filter((s) => s.file === "src/app/inbox.tsx" || s.file === "src/app/wiki.tsx");
    expect(inRoutes).toEqual([]);
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
    //
    // ⚠ 2026-10-04 재조준 (qa261004 L1-20). 이 검사는 dds-import-inbox-screens.tsx 를
    // 읽고 초록이었다. 그런데 그 파일의 DeepSpaceInboxScreen 은 **그림자 사본**이다 -
    // /inbox 라우트는 08-31 부터 dds-inbox-screen.tsx 를 그렸고, #1796(09-13)의 신호
    // 카드는 그림자에만 들어갔다. 배송 허브에서 /sources 로 가는 길은 0건이었는데
    // 이 검사는 거짓 초록을 냈다. 그래서 이제 허브 파일을 **라우트가 실제로
    // import 하는 곳에서** 읽고, 그 파일이 그림자가 아닌지도 판정기로 확인한다.
    const route = stripComments(read("src/app/inbox.tsx"));
    const imported = /import\s*\{[^}]*\bDeepSpaceInboxScreen\b[^}]*\}\s*from\s*"@\/([^"]+)"/.exec(route);
    expect(imported).not.toBeNull();
    const hubFile = `src/${imported![1]}.tsx`;
    // 그림자 사본(dds-import-inbox-screens 의 같은 이름)은 2026-10-05 에 나갔다. 빈
    // 명단에 every() 를 걸면 공허하게 참이므로, 이름이 **한 곳에만** 정의돼 있는지를 본다.
    expect(duplicatedComponentNames(ROOT)).not.toContain("DeepSpaceInboxScreen");
    const hub = stripComments(read(hubFile));
    expect(hub).toMatch(/route="\/sources"/);
    expect(hub).toContain("listSources(ownerId, { ingested: false");
    // 라우트가 실재한다.
    expect(fs.existsSync(path.join(ROOT, "src/app/sources.tsx"))).toBe(true);
    const screen = stripComments(read("src/screens/deepspace/dds-sources-screen.tsx"));
    expect(screen).toMatch(/\brunPhase1\s*\(/);
    expect(screen).toMatch(/\bgenerateSourcePage\s*\(/);
  });
});
