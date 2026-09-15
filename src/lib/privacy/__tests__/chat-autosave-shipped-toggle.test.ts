// 대화 자동 저장 토글이 **배송되는** /privacy 에 있는가 (Q-260914-01, 2026-09-14).
//
// 켜는 토글은 PrivacyLegacy 의 VISIBLE_PRIVACY_KEYS.map 에만 있었고, 그 반쪽은
// isDeepSpaceUI() 분기 뒤라 어느 배포도 그리지 않는다. 배송 화면
// (DeepSpacePrivacyDesignScreen)에는 chat_autosave 가 0건이었다. enforcer 는 있는데
// 켤 방법이 없는 상태였다. autosave.test.ts 의 "설정 화면에 보인다" 는 키 목록만
// 봐서 그걸 못 봤다.
//
// 그래서 여기서는 셋을 본다:
//   · 저장 경로가 동의 원장을 거친다 (순수 함수 + 실제 savePrivacyPref, DB 만 목)
//   · 미성년 규칙은 prefs.ts 한 곳에서 온다
//   · 배송 화면 조각이 그 둘을 실제로 쓴다 (레거시 반쪽이 아니라)

jest.mock("../../supabase/client", () => {
  const maybeSingle = jest.fn();
  const eqSelect = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq: eqSelect }));
  const eqUpdate = jest.fn();
  const update = jest.fn(() => ({ eq: eqUpdate }));
  const insert = jest.fn();
  const from = jest.fn(() => ({ select, update, insert }));
  return {
    getSupabaseClient: () => ({ from }),
    __maybeSingle: maybeSingle,
    __update: update,
    __eqUpdate: eqUpdate,
    __insert: insert,
  };
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { MINOR_PROMOTABLE_KEYS, defaultPrivacyPrefs, nextPrivacyPrefs, type PrivacyPrefs } from "../prefs";
import { readPrivacyPrefs, savePrivacyPref } from "../../supabase/privacy";

const { __maybeSingle, __update, __eqUpdate, __insert } = jest.requireMock("../../supabase/client") as {
  __maybeSingle: jest.Mock;
  __update: jest.Mock;
  __eqUpdate: jest.Mock;
  __insert: jest.Mock;
};

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

/** check-constraints.ts 의 screenSlice 와 같은 자르기. megafile 전체를 읽으면
 *  다른 화면의 <Toggle> 이 대신 통과시킨다(그 파일이 변이 검증에서 겪은 일). */
function screenSlice(source: string, component: string): string {
  const at = source.indexOf(`export function ${component}(`);
  if (at < 0) return "";
  const end = source.indexOf("\nexport function", at + 10);
  return end < 0 ? source.slice(at) : source.slice(at, end);
}

/** 컴포넌트 안 함수 하나의 본문. 두 칸 들여쓰기 닫는 중괄호까지. */
function innerFunction(slice: string, header: string): string {
  const at = slice.indexOf(header);
  if (at < 0) return "";
  const end = slice.indexOf("\n  }\n", at);
  return end < 0 ? "" : slice.slice(at, end);
}

describe("nextPrivacyPrefs - 스위치 하나가 저장할 전체 객체", () => {
  it("미성년도 chat_autosave 는 켤 수 있다", () => {
    expect(MINOR_PROMOTABLE_KEYS).toContain("chat_autosave");
    expect(nextPrivacyPrefs(defaultPrivacyPrefs(), "chat_autosave", true, true)?.chat_autosave).toBe(true);
  });

  it("미성년은 잠긴 키를 못 켠다 - 화면이 아니라 여기서 막힌다", () => {
    expect(nextPrivacyPrefs(defaultPrivacyPrefs(), "ads", true, true)).toBeNull();
    expect(nextPrivacyPrefs(defaultPrivacyPrefs(), "external_analytics", true, true)).toBeNull();
    // 대조군: 성인은 같은 키를 켤 수 있다. 이게 없으면 위 두 줄은 "항상 null" 로도 통과한다.
    expect(nextPrivacyPrefs(defaultPrivacyPrefs(), "ads", true, false)?.ads).toBe(true);
  });

  it("값이 그대로면 저장할 것이 없다", () => {
    expect(nextPrivacyPrefs(defaultPrivacyPrefs(), "chat_autosave", false, false)).toBeNull();
  });

  it("다른 키를 건드리지 않고 원본을 바꾸지 않는다", () => {
    const current: PrivacyPrefs = { ...defaultPrivacyPrefs(), ops_push: true };
    expect(nextPrivacyPrefs(current, "chat_autosave", true, false)).toEqual({ ...current, chat_autosave: true });
    expect(current.chat_autosave).toBe(false);
  });
});

// 화면은 키 하나만 저장한다(r3as F-01). 다른 세션의 철회를 되살리지 않는 동작은
// src/lib/supabase/__tests__/privacy-single-key-save.test.ts 가 상태를 가진 목으로 돌려 본다.
describe("저장 경로가 동의 원장을 거친다 (savePrivacyPref -> consent_changes)", () => {
  beforeEach(() => {
    __maybeSingle.mockReset();
    __update.mockClear();
    __eqUpdate.mockReset();
    __insert.mockReset();
    __eqUpdate.mockResolvedValue({ error: null });
    __insert.mockResolvedValue({ error: null });
  });

  it("켜면 chat_autosave grant 한 줄이 남는다", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: { privacy_prefs: {} }, error: null });
    await savePrivacyPref("u1", "chat_autosave", true, { locale: "ko" });
    expect(__update).toHaveBeenCalledWith({ privacy_prefs: { chat_autosave: true } });
    expect(__insert).toHaveBeenCalledWith([{ user_id: "u1", pref_key: "chat_autosave", event_type: "grant" }]);
  });

  it("끄면 chat_autosave revoke 한 줄이 남는다 - 철회도 기록이다", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: { privacy_prefs: { chat_autosave: true } }, error: null });
    await savePrivacyPref("u1", "chat_autosave", false);
    expect(__insert).toHaveBeenCalledWith([{ user_id: "u1", pref_key: "chat_autosave", event_type: "revoke" }]);
  });
});

describe("배송 /privacy 화면에 대화 저장 토글이 있다", () => {
  const screen = screenSlice(read("src/screens/deepspace/DeepSpaceDesignScreens.tsx"), "DeepSpacePrivacyDesignScreen");
  const handler = innerFunction(screen, "async function toggleChatAutosave(");

  it("화면 조각과 핸들러를 실제로 잘랐다 - 0건 통과를 막는다", () => {
    expect(screen.length).toBeGreaterThan(2000);
    expect(handler.length).toBeGreaterThan(100);
  });

  it("동의 문구 번들의 라벨과 설명으로 그린다", () => {
    expect(screen).toContain('consentT("privacy.keys.chat_autosave.label")');
    expect(screen).toContain('consentT("privacy.keys.chat_autosave.desc")');
    expect(screen).toContain("onPress={() => void toggleChatAutosave(!chatSaveOn)}");
  });

  it("확인 전에는 스위치 자리에 불러오는 중이나 다시 읽기를 그린다", () => {
    // 읽기 실패와 저장된 꺼짐을 가르는 동작은 아래 "설정을 못 읽으면" 묶음이 화면의 실제
    // 본문을 돌려서 본다. 여기서는 그 상태가 스위치 자리에 그려지는지만 본다 - 이 저장소에서
    // 컴포넌트 렌더 테스트는 막혀 있다(RN 0.85).
    expect(screen).toContain("const [chatSaveOn, setChatSaveOn] = useState<boolean | null>(null);");
    expect(screen).toContain("chatSaveOn === null ? (");
    expect(screen).toContain("prefsLoadFailed ??");
  });

  it("같은 저장 경로를 쓴다", () => {
    expect(handler).toContain('await savePrivacyPref(targetUserId, "chat_autosave", next');
  });

  it("미성년 규칙을 화면이 다시 쓰지 않는다", () => {
    expect(handler).toContain('nextPrivacyPrefs(prefsRef.current, "chat_autosave", next, minorRef.current)');
    // 사용 통계·광고 토글의 "미성년이면 무조건 막기" 를 복사해 오면
    // MINOR_PROMOTABLE_KEYS 가 조용히 무시된다.
    expect(handler).not.toMatch(/minorRef\.current\s*\|\|/);
    expect(screen).not.toContain('toggleExternalPreference("chat_autosave"');
  });

  it("저장 실패를 말한다", () => {
    expect(handler).toContain("setChatSaveError(true)");
    expect(screen).toContain('t("privacy.chatSaveError")');
  });
});

// ── 설정을 못 읽으면 꺼짐으로 그리지 않는다 (r3as F-04) ──────────────────────────────
//
// fetchPrivacyPrefs 는 읽기 실패를 전부 꺼짐으로 바꾼다. 게이트에는 맞는 자세지만 스위치에는
// 틀리다: 켜 둔 사람에게 "꺼짐"을 보여 주고, 그 사람이 누르면 끄는 대신 켜기를 저장한다.
// 여기서는 화면을 렌더하지 않고 **실제 선언**(읽기 useEffect, 토글 핸들러)만 AST 로 떼어
// inert 바인딩 위에서 돌린다. 읽기 함수는 진짜고 DB 만 목이다.

/** megafile 이라 같은 이름이 다른 화면에도 있다. 배송 /privacy 선언 안으로 먼저 좁힌다. */
function privacyScreenPart(match: (node: ts.Node, text: () => string) => boolean): string {
  const file = join(ROOT, "src/screens/deepspace/DeepSpaceDesignScreens.tsx");
  const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { screen?: ts.Node; text?: string } = {};
  const findScreen = (node: ts.Node): void => {
    if (found.screen) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpacePrivacyDesignScreen") found.screen = node;
    else ts.forEachChild(node, findScreen);
  };
  findScreen(ast);
  if (!found.screen) throw new Error("DeepSpacePrivacyDesignScreen 선언을 찾지 못했다");
  const findPart = (node: ts.Node): void => {
    if (found.text !== undefined) return;
    if (match(node, () => node.getText(ast))) found.text = node.getText(ast);
    else ts.forEachChild(node, findPart);
  };
  ts.forEachChild(found.screen, findPart);
  if (found.text === undefined) throw new Error("배송 /privacy 화면에서 그 조각을 찾지 못했다");
  return found.text;
}

const effectWith = (marker: string): string =>
  privacyScreenPart(
    (node, text) =>
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect" && text().includes(marker),
  );
const handlerNamed = (name: string): string =>
  privacyScreenPart((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);

/** 떼어낸 원문을 바인딩 위에서 실행한다. 재구현이 아니라 화면의 본문이다. */
function execute<T>(source: string, tail: string, bindings: Record<string, unknown>): T {
  const js = ts.transpileModule(`${source}\n${tail}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as T;
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** 화면의 설정 읽기 effect 를 한 번 돌리고, 스위치마다 무엇이 그려졌는지 받아 적는다. */
function loadScreenPrefs() {
  const drawn = { analytics: [] as unknown[], ads: [] as unknown[], rec: [] as unknown[], embed: [] as unknown[], chat: [] as unknown[] };
  const loadError: boolean[] = [];
  const prefsRef: { current: PrivacyPrefs | null } = { current: null };
  execute(effectWith("readPrivacyPrefs(targetUserId)"), "", {
    useEffect: (effect: () => unknown) => {
      effect();
    },
    userId: "u1",
    prefsReadKey: 0,
    activeUserRef: { current: "u1" },
    prefsRef,
    prefsUserRef: { current: null },
    readPrivacyPrefs,
    setPrefsLoadError: (value: boolean) => loadError.push(value),
    setAnalyticsOn: (value: unknown) => drawn.analytics.push(value),
    setAdsOn: (value: unknown) => drawn.ads.push(value),
    setRecOn: (value: unknown) => drawn.rec.push(value),
    setEmbedOn: (value: unknown) => drawn.embed.push(value),
    setChatSaveOn: (value: unknown) => drawn.chat.push(value),
  });
  return { drawn, loadError, prefsRef };
}

describe("설정을 못 읽으면 꺼짐으로 그리지 않는다 (r3as F-04)", () => {
  beforeEach(() => {
    __maybeSingle.mockReset();
    __update.mockClear();
    __eqUpdate.mockReset();
    __insert.mockReset();
  });

  it("읽기가 실패하면 어느 스위치에도 값을 정하지 않고 실패를 알린다", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: null, error: new Error("network down") });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const screenLoad = loadScreenPrefs();
      await settle();
      expect(screenLoad.drawn).toEqual({ analytics: [], ads: [], rec: [], embed: [], chat: [] });
      expect(screenLoad.prefsRef.current).toBeNull();
      expect(screenLoad.loadError.at(-1)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("대조군: 읽기가 되면 저장된 값을 그린다", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: { privacy_prefs: { chat_autosave: true } }, error: null });
    const screenLoad = loadScreenPrefs();
    await settle();
    expect(screenLoad.drawn.chat).toEqual([true]);
    expect(screenLoad.drawn.ads).toEqual([false]);
    expect(screenLoad.loadError).not.toContain(true);
    expect(screenLoad.prefsRef.current?.chat_autosave).toBe(true);
  });

  it("확인된 값이 오기 전에는 스위치를 눌러도 읽지도 저장하지도 않는다", async () => {
    const save = jest.fn();
    const saved: unknown[] = [];
    const toggle = execute<(next: boolean) => Promise<void>>(handlerNamed("toggleChatAutosave"), "return toggleChatAutosave;", {
      userId: "u1",
      busy: false,
      ko: true,
      prefsRef: { current: null },
      prefsUserRef: { current: null },
      minorRef: { current: false },
      privacyMountedRef: { current: true },
      activeUserRef: { current: "u1" },
      nextPrivacyPrefs,
      savePrivacyPrefs: save,
      savePrivacyPref: save,
      setChatSaveError: () => undefined,
      setBusy: () => undefined,
      setChatSaveOn: (value: unknown) => saved.push(value),
    });
    await toggle(true);
    expect(save).not.toHaveBeenCalled();
    expect(__maybeSingle).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("못 읽었을 때 스위치 자리에 다시 읽기를 둔다", () => {
    const screen = screenSlice(read("src/screens/deepspace/DeepSpaceDesignScreens.tsx"), "DeepSpacePrivacyDesignScreen");
    expect(screen).toContain('t("privacy.prefsLoadError")');
    expect(screen).toContain("setPrefsReadKey((k) => k + 1)");
    // 다시 읽기는 읽기 effect 를 다시 돌린다 - 올려 두고 아무도 안 보면 버튼이 거짓말을 한다.
    expect(effectWith("readPrivacyPrefs(targetUserId)")).toMatch(/\[userId, prefsReadKey\]\s*\)$/);
  });
});

describe("카드 문구", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  // prefsLoadError · prefsRetry 는 r3as F-04 의 읽기 실패 자리다.
  const KEYS = ["chatSaveSection", "chatSaveLoading", "chatSaveError", "prefsLoadError", "prefsRetry"] as const;
  const privacy = (loc: string): Record<string, string> =>
    (JSON.parse(read(`locales/${loc}/deepspace.json`)) as { privacy: Record<string, string> }).privacy;

  it("다섯 로케일에 있다", () => {
    for (const loc of LOCALES) {
      for (const key of KEYS) {
        expect({ loc, key, ok: typeof privacy(loc)[key] === "string" && privacy(loc)[key].length > 0 }).toEqual({
          loc,
          key,
          ok: true,
        });
      }
    }
  });

  it("em dash 가 없다", () => {
    for (const loc of LOCALES) for (const key of KEYS) expect(privacy(loc)[key]).not.toContain("—");
  });

  it("베타 로케일이 영어 사본이 아니다", () => {
    const en = privacy("en");
    for (const loc of ["es", "pt", "id"] as const) {
      for (const key of KEYS) expect({ loc, key, same: privacy(loc)[key] === en[key] }).toEqual({ loc, key, same: false });
    }
  });

  it("한국어 오류 문구는 해요체다", () => {
    for (const key of ["chatSaveError", "prefsLoadError"] as const) {
      expect(privacy("ko")[key]).toMatch(/요\./);
      expect(privacy("ko")[key]).not.toMatch(/니다\./);
    }
  });
});
