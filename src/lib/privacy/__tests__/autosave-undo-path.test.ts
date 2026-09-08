// 자동 저장의 전제 — "되돌릴 길이 먼저 있다" — 가 배송에서 성립하는가.
//
// `src/lib/chat/autosave.ts` 는 기본값 OFF 의 근거를 적으면서 **자기 실패 조건까지**
// 적어 뒀다: *"지우는 길 없이 자동 저장부터 켰다면 그건 순서가 틀린 것이다."*
// 2026-09-08 실측으로 지금이 그 상태다. 그리고 같은 전제가
// `src/lib/privacy/prefs.ts` 에서 **미성년도 스스로 켤 수 있다**는 판단의 근거로
// 다시 쓰인다.
//
// 이 검사는 그 상태를 **고치지 않는다.** 페이지 단위 삭제를 배송 화면에 넣을지는
// 제품 결정이다. 검사가 지는 것은 두 가지다:
//   · 사실이 바뀌면(누가 삭제를 되살리면) 실패해서 두 주석의 정정문을 걷게 한다
//   · 그때까지 이 사실이 조용히 잊히지 않게 한다
//
// ⚠ 스팬 모듈은 wiki.tsx 의 죽은 반쪽을 118..871 로 읽는데, `WikiLegacy` 는 실제로
// 1137 근처까지 간다(다음 최상단 함수가 :1139). 열 0 닫는 중괄호로 끝을 찾는
// 방식이라 함수 중간의 열 0 중괄호에서 일찍 끊긴다. 그래서 여기서는 **호출부
// 한 줄**(:292, 스팬 안)만 근거로 삼고 UI 위치는 근거로 쓰지 않는다.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel: string): string =>
  fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

/** src 아래 배송 코드. 검사·목은 화면을 그리지 않는다. */
function shippingSources(dir: string = path.join(ROOT, "src"), out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "__mocks__") {
        continue;
      }
      shippingSources(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return out;
}

describe("자동 저장이 전제한 '되돌릴 길'", () => {
  const files = shippingSources();

  test("스캐너가 실제로 읽었다", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  test("페이지 단위 삭제를 부르는 곳은 위키의 죽은 반쪽 하나뿐이다", () => {
    const callers = files
      .filter(rel => rel !== "src/lib/wiki/queries.ts") // 정의부
      .filter(rel => /\bdeleteWikiPage\s*\(/.test(read(rel)));
    // 호출부가 하나이고, 그것이 어느 빌드도 그리지 않는 반쪽에 있다.
    expect(callers).toEqual(["src/app/wiki.tsx"]);

    const wiki = read("src/app/wiki.tsx").split("\n");
    const callLine = wiki.findIndex(l => /await deleteWikiPage\(/.test(l)) + 1;
    const legacyStart = wiki.findIndex(l => l.startsWith("function WikiLegacy(")) + 1;
    const nextTopLevel = wiki.findIndex(
      (l, i) => i > legacyStart && /^(?:export )?function \w+\(/.test(l),
    ) + 1;
    expect(legacyStart).toBeGreaterThan(0);
    expect(callLine).toBeGreaterThan(legacyStart);
    expect(callLine).toBeLessThan(nextTopLevel);
  });

  test("배송되는 위키 화면에는 삭제 어포던스가 없다", () => {
    const live = read("src/screens/deepspace/dds-wiki-records-screens.tsx");
    const wikiScreen = live.slice(live.indexOf("export function DeepSpaceWikiScreen()"));
    expect(wikiScreen).not.toMatch(/delete/i);
    expect(wikiScreen).not.toContain("삭제");
  });

  test("남아 있는 것은 전부 지우기이고 페이지 단위가 아니다", () => {
    // 이게 사라지면 되돌릴 길이 **아예** 없어진다 - 그건 더 나쁜 상태다.
    const settings = read("src/app/settings.tsx");
    expect(settings).toContain("await deleteAllWikiPages(userId)");
    const bulk = read("src/lib/records/delete-bulk.ts");
    // 사용자 전체를 지운다 - 한 페이지를 고를 수 없다는 것이 요점이다.
    expect(bulk).toContain('.from("wiki_pages")');
    expect(bulk).toContain('.eq("user_id", userId)');
  });

  test("근거를 적은 두 파일이 이 사실을 함께 적고 있다", () => {
    // 사실만 바뀌고 근거 문서가 안 따라오면, 다음 사람은 옛 근거를 읽고 판단한다.
    const autosave = read("src/lib/chat/autosave.ts");
    const prefs = read("src/lib/privacy/prefs.ts");
    expect(autosave).toContain("2026-09-08 실측");
    expect(autosave).toContain("autosave-undo-path.test.ts");
    // ⚠ prefs.ts 는 **줄 수를 바꾸지 않고** 한 줄만 고쳤다. DPIA 앵커 다섯 개가 그
    // 파일의 줄번호를 인용하고 있어서(dpia-crisis-rail-anchors), 주석 여덟 줄을
    // 끼우자 법률 인용이 전부 밀려 빨개졌다. 사실을 적는 일이 인용을 깨뜨리면
    // 적는 방법을 바꾼다 - 인용을 미는 쪽이 아니라.
    expect(prefs).toContain("2026-09-08 실측 거짓");
    expect(prefs).toContain("src/lib/chat/autosave.ts 정정 참조");
    // 원문을 지우지 않았는지 - 정정은 덧붙이는 것이지 덮는 것이 아니다.
    expect(autosave).toContain("되돌릴 길이 먼저 있다는 것도 전제다.");
    expect(prefs).toContain("`/wiki` 에서 언제든 지울 수 있다(deleteWikiPage)");
  });
});
