// 배송 위키 화면에서 페이지 한 장을 지운다 (Q-260914-01, 2026-09-14).
//
// 한 장 삭제는 레거시 반쪽(src/app/wiki.tsx 의 WikiLegacy)에만 있었고, 배송 화면
// DeepSpaceWikiScreen 에는 삭제 어포던스가 0건이었다(2026-09-08 실측,
// autosave-undo-path.test.ts). 여기서는 되살린 쪽이 약속한 모양을 지키는지 본다:
//   · 누르면 바로 지우지 않고 확인을 한 번 거친다 - 되돌릴 수 없어서다
//   · 지우는 호출은 확인 핸들러 한 곳뿐이다
//   · 지운 뒤 목록을 서버에서 다시 읽는다
//   · 실패하면 말한다
//
// ⚠ 라우트 파일(src/app/wiki.tsx)이 아니라 배송 화면 파일을 읽는다. 라우트 파일에는
//   비슷한 문자열이 레거시 반쪽에 있어서, 그걸 읽으면 이 검사는 영원히 초록이다
//   (guard-pins-not-in-dead-renderers).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

const FILE = read("src/screens/deepspace/dds-wiki-records-screens.tsx");
const SCREEN = FILE.slice(Math.max(0, FILE.indexOf("export function DeepSpaceWikiScreen()")));

/** 화면 안 useCallback 하나의 본문. `const name = useCallback(` 부터 의존성 배열 직전까지. */
function callbackBody(name: string): string {
  const at = SCREEN.indexOf(`const ${name} = useCallback(`);
  if (at < 0) return "";
  const end = SCREEN.indexOf("\n  }, [", at);
  return end < 0 ? "" : SCREEN.slice(at, end);
}

const confirm = callbackBody("confirmDeletePage");

describe("배송 위키 화면의 한 장 삭제", () => {
  test("화면 조각과 확인 핸들러를 실제로 잘랐다 - 0건 통과를 막는다", () => {
    expect(FILE.indexOf("export function DeepSpaceWikiScreen()")).toBeGreaterThan(0);
    expect(confirm.length).toBeGreaterThan(100);
  });

  test("지우는 호출은 확인 핸들러 안 한 곳뿐이다", () => {
    expect((SCREEN.match(/deleteWikiPage\(/g) ?? []).length).toBe(1);
    expect(confirm).toContain("await deleteWikiPage(userId, page.id)");
  });

  test("누르면 대기 상태만 세우고, 확인 창이 그 상태로 열린다", () => {
    expect(SCREEN).toContain("setPendingDelete({ id: p.id, title: p.title })");
    expect(SCREEN).toContain("visible={pendingDelete !== null}");
    expect(SCREEN).toContain("onPress={() => void confirmDeletePage()}");
    expect(SCREEN).toContain('tw("deleteConfirmBody")');
  });

  test("두 번 눌러도 한 번만 지운다", () => {
    expect(confirm).toContain("deleteInFlightRef.current");
  });

  test("지운 뒤 목록을 서버에서 다시 읽는다", () => {
    const deleted = confirm.indexOf("await deleteWikiPage(");
    expect(deleted).toBeGreaterThan(0);
    expect(confirm.indexOf("reload()")).toBeGreaterThan(deleted);
    // 다시 읽는 방아쇠가 실제로 불러오기 effect 의 의존성에 걸려 있다.
    expect(FILE).toContain("}, [userId, reloadKey]);");
  });

  test("실패를 말한다", () => {
    expect(confirm).toContain('setDeleteNotice("failed")');
    expect(SCREEN).toContain('t("wiki.deleteFailed")');
  });

  test("버튼이 스크린리더에 어느 페이지인지 말한다", () => {
    expect(SCREEN).toContain('accessibilityLabel={tw("deletePageFor", { title: p.title })}');
  });
});

describe("확인 문구", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  const wiki = (loc: string): Record<string, string> =>
    JSON.parse(read(`locales/${loc}/wiki.json`)) as Record<string, string>;
  const ds = (loc: string): Record<string, string> =>
    (JSON.parse(read(`locales/${loc}/deepspace.json`)) as { wiki: Record<string, string> }).wiki;

  test("되돌릴 수 없다는 사실을 다섯 언어 모두 말한다", () => {
    const IRREVERSIBLE: Record<(typeof LOCALES)[number], RegExp> = {
      en: /can't undo/i,
      ko: /되돌릴 수 없/,
      es: /no se puede deshacer/i,
      pt: /não pode ser desfeito/i,
      id: /tidak dapat dibatalkan/i,
    };
    for (const loc of LOCALES) expect({ loc, body: wiki(loc).deleteConfirmBody }).toEqual({
      loc,
      body: expect.stringMatching(IRREVERSIBLE[loc]),
    });
  });

  test("화면이 부르는 키가 다섯 언어에 있다", () => {
    const WIKI_KEYS = [
      "deletePage",
      "deletePageFor",
      "deleteConfirmLabel",
      "deleteConfirmTitle",
      "deleteConfirmBody",
      "cancel",
      "cancelHint",
      "delete",
      "deleteHint",
      "pageDeleted",
    ];
    for (const loc of LOCALES) {
      for (const key of WIKI_KEYS) {
        expect({ loc, key, ok: typeof wiki(loc)[key] === "string" }).toEqual({ loc, key, ok: true });
      }
      expect({ loc, ok: typeof ds(loc).deleteFailed === "string" }).toEqual({ loc, ok: true });
    }
  });

  test("새 오류 문구는 em dash 가 없고, 베타 로케일은 영어 사본이 아니며, 한국어는 해요체다", () => {
    for (const loc of LOCALES) expect(ds(loc).deleteFailed).not.toContain("—");
    for (const loc of ["es", "pt", "id"] as const) expect(ds(loc).deleteFailed).not.toBe(ds("en").deleteFailed);
    expect(ds("ko").deleteFailed).toMatch(/요\./);
  });
});
