// A screen that hands a route parameter to nobody is making a promise it cannot keep.
//
// This is the fourth shape in the family. The first three:
//
//   dead renderer span     a citation lands inside the half no build draws
//                          (legal-citations-not-in-dead-renderers)
//   shadow screen          two files export the same screen name and the route
//                          takes only one (shadow-screens)
//   pinned, unrendered     only the checks ever name a component
//                          (pinned-components-have-a-subject)
//
// This one crosses screens. `router.push({ pathname: "/", params: { highlightRecordId } })`
// compiles, navigates, and does nothing at the far end if the destination never
// reads that name. Nothing throws. The user just does not get what the button said.
//
// The case that produced this file: /capture's post-save CTA is labelled
// "그래프 보기" and its accessibility hint says "그래프를 열고 방금 저장한 별가루를
// 강조해요" — read aloud to screen-reader users. It sends highlightRecordId to "/",
// and the only code that reads that name sits in src/app/index.tsx's legacy half,
// which no deployment renders. Two claims, neither kept, no error anywhere.
//
// ⚠ Counted in ONE direction. "no shipped file mentions this name" is sound;
// "a file mentions it, therefore it is read" is not. So this undercounts, which
// is the safe way to be wrong — a false alarm here would push someone to delete
// a parameter that IS honoured.
import fs from "node:fs";
import path from "node:path";

import { deadRendererSpans } from "../dead-renderer-spans";

const ROOT = process.cwd();

/**
 * Parameters a shipped screen sends that no shipped screen reads, with why each
 * is still here. A roster, not an exemption list: the tests below check the claims.
 *
 * Every row is a promise the app is currently not keeping. They are listed rather
 * than fixed because the fix is a product call — restore the receiver, or change
 * the copy that promises it — and picking one of those alone is not a test's job.
 */
const SENT_TO_NOBODY: Readonly<Record<string, string>> = {
  highlightRecordId:
    "/capture 저장 후 CTA(라벨 '그래프 보기', 힌트 '…방금 저장한 별가루를 강조해요')가 '/' 로 보낸다. " +
    "읽는 코드는 src/app/index.tsx 의 레거시 반쪽에만 있어 배송되지 않는다. **약속이 두 개 다 안 지켜진다** — " +
    "배송 홈은 그래프가 아니라 별자리고, 강조도 없다. 되살릴지 문구를 고칠지는 Simon 결정 대기.",
  focusSourceId:
    "/inbox 의 '위키에서 보기'가 보낸다. 배송 위키는 focusPageId(페이지 id)를 읽는다 — 뜻이 다른 값이라 " +
    "이름만 바꿔서는 안 된다. 화면 자신의 주석이 그렇게 적고 있다(dds-wiki-records-screens.tsx). Simon 결정 대기.",
  draft:
    "/imagine 의 '+ 추가'(ds.possible.add)가 고른 가능성 카드 이름을 /ops 로 들려 보낸다. " +
    "보내는 쪽 **코드 주석이 계약을 적고 있다** — 'The selected draft rides along as a param " +
    "so /ops proposes from it'. 그런데 배송 /ops 화면(dds-ops-screen.tsx)은 라우트 " +
    "파라미터를 **0건** 읽는다. 라벨('+ 추가')이 거짓말하는 건 아니지만 고른 카드가 " +
    "안 실려 가서 사용자가 다시 친다. 주석이 사실이 아니게 된 쪽이 먼저 고쳐질 것. Simon 결정 대기.",
};

/** Files that draw the app. Not tests, not mocks, not the modules that analyse code.
 *
 *  The exclusion is load-bearing: a checker that reads its own corpus finds its own
 *  prose as evidence. dead-renderer-spans.ts learned that twice in one day. */
function shippingSources(dir: string = path.join(ROOT, "src"), out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "__mocks__") {
        continue;
      }
      shippingSources(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (!rel.startsWith("src/lib/legal/")) out.push(rel);
    }
  }
  return out;
}

/** The file with the half no build draws cut out. */
function liveText(rel: string, spans: ReadonlyMap<string, { from: number; to: number }>): string {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");
  const span = spans.get(rel);
  if (!span) return src;
  const lines = src.split("\n");
  return [...lines.slice(0, span.from - 1), ...lines.slice(span.to)].join("\n");
}

interface Scan {
  senders: Map<string, Set<string>>;
  readers: Set<string>;
  scanned: number;
}

function scan(): Scan {
  const spans = new Map(deadRendererSpans(ROOT).map(s => [s.file, { from: s.from, to: s.to }]));
  const files = shippingSources();
  const senders = new Map<string, Set<string>>();
  const readers = new Set<string>();

  for (const rel of files) {
    const live = liveText(rel, spans);

    for (const m of live.matchAll(/params:\s*\{([^}]*)\}/g)) {
      // ⚠ 키는 **여는 중괄호나 쉼표 바로 뒤**에만 온다. 처음엔 앞을 안 고정하고 훑었는데
      // 그러면 **값 안의 i18n 키**가 키로 잡힌다 — 실측:
      //   params: { fromNode: t("big-five:title") }
      // 에서 `five` 가 파라미터 이름으로 세여 명단에 없는 이름이 하나 생겼다.
      // 이 검사가 잡으려는 부류를 이 검사가 저지른 셈이라 앞을 고정한다.
      for (const key of m[1].matchAll(/(?:^|[{,])\s*(\w+)\s*[:,}]/g)) {
        const name = key[1];
        if (name.length < 4) continue; // `id` and friends are router-owned
        if (!senders.has(name)) senders.set(name, new Set());
        senders.get(name)!.add(rel);
      }
    }
    for (const m of live.matchAll(/useLocalSearchParams<\{([^}]*)\}>/g)) {
      for (const key of m[1].matchAll(/(\w+)\??\s*:/g)) readers.add(key[1]);
    }
    for (const m of live.matchAll(/params\.(\w+)/g)) readers.add(m[1]);
    for (const m of live.matchAll(/useLocalSearchParams\(\)\s*as\s*[^;]*?\{([^}]*)\}/g)) {
      for (const key of m[1].matchAll(/(\w+)\??\s*:/g)) readers.add(key[1]);
    }
  }
  return { senders, readers, scanned: files.length };
}

describe("배송 화면이 보내는 파라미터를 배송 화면이 읽는가", () => {
  const { senders, readers, scanned } = scan();
  const orphans = [...senders.entries()].filter(([name]) => !readers.has(name));

  test("스캐너가 실제로 읽었다 - 0건 통과를 막는다", () => {
    // "위반 0건" 과 "아무것도 안 봤다" 는 다른 상태다.
    expect(scanned).toBeGreaterThan(200);
    expect(senders.size).toBeGreaterThanOrEqual(8);
    expect(readers.size).toBeGreaterThanOrEqual(20);
    // 죽은 반쪽을 실제로 잘라내고 있는지 - 이게 0이면 이 검사는 옛 검사와 같은 것을 본다.
    expect(deadRendererSpans(ROOT).length).toBeGreaterThanOrEqual(5);
  });

  test("받는 곳 없는 파라미터는 전부 명단에 있다", () => {
    const unlisted = orphans
      .filter(([name]) => !(name in SENT_TO_NOBODY))
      .map(([name, where]) => `${name} — 보내는 곳: ${[...where].join(", ")}`);
    if (unlisted.length > 0) {
      throw new Error(
        `배송 화면이 보내는데 배송 어디도 안 읽는 파라미터가 새로 생겼다:\n  ${unlisted.join("\n  ")}\n\n` +
          `보내는 쪽 버튼이 무엇을 약속하는지 먼저 읽을 것 - 라벨과 접근성 힌트까지.\n` +
          `약속이 있으면 **받는 쪽을 만들거나 문구를 고친다.** 파라미터만 조용히 지우면\n` +
          `약속이 깨진 채로 남는다. 그대로 두기로 했다면 이 파일의 SENT_TO_NOBODY 에\n` +
          `**이유와 함께** 적는다.`,
      );
    }
  });

  test("명단의 줄들이 아직 설명할 대상을 갖는다", () => {
    // 1) 아무도 안 보낸다 = 설명할 것이 없어졌다
    const noSender = Object.keys(SENT_TO_NOBODY).filter(name => !senders.has(name));
    // 2) 이제 읽는 곳이 생겼다 = 설명이 틀렸다 (고쳐진 것이니 줄을 지운다)
    const nowRead = Object.keys(SENT_TO_NOBODY).filter(
      name => senders.has(name) && readers.has(name),
    );
    // 두 상태를 한 단언에 섞지 않는다 - 섞으면 실패 메시지가 다시 한 색이 된다.
    expect({ 보내는_곳이_사라진_줄: noSender }).toEqual({ 보내는_곳이_사라진_줄: [] });
    expect({ 이제_읽히는_줄: nowRead }).toEqual({ 이제_읽히는_줄: [] });
  });
});
