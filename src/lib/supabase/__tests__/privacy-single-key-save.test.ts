// 설정은 키 하나만 저장한다 - 다른 기기나 탭에서 끈 동의를 되살리지 않는다 (r3as F-01, 2026-09-14).
//
// 배송 /privacy 화면은 불러올 때 받은 prefs 객체 전체를 들고 있다가, 스위치 하나를 바꿀 때 그 전체를
// 저장했다(savePrivacyPrefs). 그 사이 다른 세션이 다른 키를 끄면 오래된 객체가 그 철회를 덮어써서
// 되살렸다. 저장 함수는 최신 값을 읽기는 했지만 원장 diff 에만 썼기 때문에, 원장에는 아무도 하지
// 않은 grant 까지 남았다.
//
// 이 목은 users.privacy_prefs 와 consent_changes 를 **상태로** 든다. 호출 인자를 받아 적기만 하는
// 목으로는 "마지막 쓰기가 무엇을 덮었나" 를 볼 수 없다. 대조군이 옛 전체 저장으로 같은 순서를 돌려
// 결함을 재현한다 - 목이 관대해서 초록인 것이 아니라는 증거다.
//
// ⚠ 이 수정은 경쟁 창을 **줄일 뿐 닫지 않는다.** 이 저장의 읽기와 쓰기 사이에 끼어든 철회는 여전히
// 덮인다. 닫으려면 서버에서 키 하나를 원자적으로 바꾸는 owner-bound RPC 가 필요하다(PR #1814 서버 후속).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type MockLedgerRow = { user_id: string; pref_key: string; event_type: string };

const mockDb = {
  prefs: new Map<string, Record<string, unknown>>(),
  ledger: [] as MockLedgerRow[],
  consentRecords: [] as Record<string, unknown>[],
  failRead: false,
  failUpdate: false,
  updates: 0,
};

jest.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () =>
                mockDb.failRead
                  ? { data: null, error: new Error("read failed") }
                  : {
                      data: mockDb.prefs.has(id) ? { privacy_prefs: structuredClone(mockDb.prefs.get(id)) } : null,
                      error: null,
                    },
            }),
          }),
          update: (patch: { privacy_prefs: Record<string, unknown> }) => ({
            eq: async (_column: string, id: string) => {
              if (mockDb.failUpdate) return { error: new Error("update failed") };
              mockDb.updates += 1;
              mockDb.prefs.set(id, structuredClone(patch.privacy_prefs));
              return { error: null };
            },
          }),
        };
      }
      if (table === "consent_changes") {
        return {
          insert: async (rows: MockLedgerRow[]) => {
            mockDb.ledger.push(...rows);
            return { error: null };
          },
        };
      }
      if (table === "consent_records") {
        return {
          insert: async (row: Record<string, unknown>) => {
            mockDb.consentRecords.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { fetchPrivacyPrefs, savePrivacyPref, savePrivacyPrefs } from "../privacy";
import { nextPrivacyPrefs, type PrivacyPrefs } from "../../privacy/prefs";

const OWNER = "user-a";

beforeEach(() => {
  mockDb.prefs = new Map([[OWNER, { external_analytics: true, chat_autosave: false }]]);
  mockDb.ledger = [];
  mockDb.consentRecords = [];
  mockDb.failRead = false;
  mockDb.failUpdate = false;
  mockDb.updates = 0;
});

const stored = (): Record<string, unknown> => mockDb.prefs.get(OWNER) ?? {};
const grantsFor = (key: string): MockLedgerRow[] =>
  mockDb.ledger.filter((row) => row.pref_key === key && row.event_type === "grant");

describe("키 하나만 최신 서버 값 위에 저장한다", () => {
  test("다른 세션이 끈 동의를 되살리지 않고, 원장에도 그 grant 가 없다", async () => {
    const staleOnScreenA = await fetchPrivacyPrefs(OWNER); // 세션 A 가 화면을 연 순간의 객체
    expect(staleOnScreenA.external_analytics).toBe(true);
    await savePrivacyPref(OWNER, "external_analytics", false); // 세션 B 가 통계를 끈다
    await savePrivacyPref(OWNER, "chat_autosave", true); // 세션 A 는 대화 저장만 켠다

    expect(stored()).toEqual({ external_analytics: false, chat_autosave: true });
    expect(grantsFor("external_analytics")).toEqual([]);
    expect(mockDb.ledger).toEqual([
      { user_id: OWNER, pref_key: "external_analytics", event_type: "revoke" },
      { user_id: OWNER, pref_key: "chat_autosave", event_type: "grant" },
    ]);
  });

  test("대조군: 옛 전체 저장은 같은 순서에서 철회를 되살린다 - 이 목은 그 결함을 볼 수 있다", async () => {
    const staleOnScreenA = await fetchPrivacyPrefs(OWNER);
    await savePrivacyPref(OWNER, "external_analytics", false);
    await savePrivacyPrefs(OWNER, { ...staleOnScreenA, chat_autosave: true });

    expect(stored().external_analytics).toBe(true);
    expect(grantsFor("external_analytics")).toHaveLength(1);
  });

  test("원장에는 바꾼 키 하나만 남고, 모르는 키와 다른 값은 그대로 둔다", async () => {
    mockDb.prefs.set(OWNER, { ads: true, sharing: "true", retired_key: 1 });
    const committed = await savePrivacyPref(OWNER, "chat_autosave", true);

    expect(stored()).toEqual({ ads: true, sharing: "true", retired_key: 1, chat_autosave: true });
    expect(mockDb.ledger).toEqual([{ user_id: OWNER, pref_key: "chat_autosave", event_type: "grant" }]);
    expect(committed.chat_autosave).toBe(true);
    expect(committed.ads).toBe(true);
    expect(committed.sharing).toBe(false); // 불리언이 아닌 값은 여전히 꺼짐으로 읽는다
  });

  test("못 읽으면 쓰지 않는다 - 기본값(전부 꺼짐)에 얹어 쓰면 그게 곧 다른 키를 모두 끄는 저장이다", async () => {
    mockDb.failRead = true;
    await expect(savePrivacyPref(OWNER, "chat_autosave", true)).rejects.toThrow("read failed");
    expect(mockDb.updates).toBe(0);
    expect(mockDb.ledger).toEqual([]);
  });

  test("쓰기가 실패하면 원장에 아무것도 남기지 않는다", async () => {
    mockDb.failUpdate = true;
    await expect(savePrivacyPref(OWNER, "chat_autosave", true)).rejects.toThrow("update failed");
    expect(mockDb.ledger).toEqual([]);
    expect(stored()).toEqual({ external_analytics: true, chat_autosave: false });
  });

  test("건강 데이터 별도 동의 기록은 이 길에서도 켜는 순간에만 남는다", async () => {
    await savePrivacyPref(OWNER, "health_import", true, { locale: "ko" });
    expect(mockDb.consentRecords).toHaveLength(1);
    expect(mockDb.consentRecords[0]).toMatchObject({ purposes: ["health_import"], sensitive_data_ack: true, locale: "ko" });

    await savePrivacyPref(OWNER, "ads", true);
    await savePrivacyPref(OWNER, "health_import", true);
    expect(mockDb.consentRecords).toHaveLength(1);
  });
});

// ── 배송 화면의 실제 핸들러 ────────────────────────────────────────────────────────
//
// 화면을 렌더하지 않고(이 저장소에서 컴포넌트 렌더 테스트는 막혀 있다) 핸들러 선언만 AST 로 떼어
// 바인딩 위에서 돌린다. 저장 함수는 진짜고 DB 만 목이다.

const SCREEN_FILE = join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx");

/** 배송 /privacy 화면 안의 함수 선언 하나를 떼어 돌린다. megafile 이라 화면 선언 안으로 먼저 좁힌다. */
function privacyHandler<T>(name: string, bindings: Record<string, unknown>): T {
  const ast = ts.createSourceFile(SCREEN_FILE, readFileSync(SCREEN_FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { screen?: ts.Node; text?: string } = {};
  const findScreen = (node: ts.Node): void => {
    if (found.screen) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpacePrivacyDesignScreen") found.screen = node;
    else ts.forEachChild(node, findScreen);
  };
  findScreen(ast);
  if (!found.screen) throw new Error("DeepSpacePrivacyDesignScreen 선언을 찾지 못했다");
  const findHandler = (node: ts.Node): void => {
    if (found.text !== undefined) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.text = node.getText(ast);
    else ts.forEachChild(node, findHandler);
  };
  ts.forEachChild(found.screen, findHandler);
  if (found.text === undefined) throw new Error(`${name} 을 배송 /privacy 화면에서 찾지 못했다`);
  const js = ts.transpileModule(`${found.text}\nreturn ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as T;
}

/** 불러온 순간의 객체를 든 성인 화면. */
function adultScreen(loaded: PrivacyPrefs) {
  const shown = { chat: [] as unknown[], analytics: [] as unknown[], ads: [] as unknown[], errors: [] as unknown[] };
  const bindings: Record<string, unknown> = {
    userId: OWNER,
    busy: false,
    ko: true,
    prefsRef: { current: loaded },
    prefsUserRef: { current: OWNER },
    minorRef: { current: false },
    privacyMountedRef: { current: true },
    activeUserRef: { current: OWNER },
    nextPrivacyPrefs,
    savePrivacyPref,
    // 옛 전체 저장도 넘긴다. 핸들러를 그쪽으로 되돌리는 변이가 참조 오류가 아니라 동작으로 빨개지게.
    savePrivacyPrefs,
    setAnalyticsConsent: () => undefined,
    setBusy: () => undefined,
    setExternalError: (value: unknown) => {
      if (value) shown.errors.push(value);
    },
    setChatSaveError: (value: unknown) => {
      if (value) shown.errors.push(value);
    },
    setChatSaveOn: (value: unknown) => shown.chat.push(value),
    setAnalyticsOn: (value: unknown) => shown.analytics.push(value),
    setAdsOn: (value: unknown) => shown.ads.push(value),
  };
  return { shown, bindings };
}

describe("배송 /privacy 화면의 스위치가 키 하나만 저장한다", () => {
  test("대화 저장 스위치: 화면이 든 오래된 객체가 다른 세션의 통계 철회를 되살리지 않는다", async () => {
    const staleOnScreenA = await fetchPrivacyPrefs(OWNER);
    await savePrivacyPref(OWNER, "external_analytics", false); // 세션 B
    const screen = adultScreen(staleOnScreenA);
    const toggle = privacyHandler<(next: boolean) => Promise<void>>("toggleChatAutosave", screen.bindings);

    await toggle(true);

    expect(stored()).toEqual({ external_analytics: false, chat_autosave: true });
    expect(grantsFor("external_analytics")).toEqual([]);
    expect(screen.shown.chat).toEqual([true]);
    expect(screen.shown.errors).toEqual([]);
  });

  test("광고 스위치도 같다: 다른 세션이 끈 대화 저장을 되살리지 않는다", async () => {
    mockDb.prefs.set(OWNER, { chat_autosave: true, ads: false });
    const staleOnScreenA = await fetchPrivacyPrefs(OWNER);
    await savePrivacyPref(OWNER, "chat_autosave", false); // 세션 B 가 대화 저장을 끈다
    const screen = adultScreen(staleOnScreenA);
    const toggle = privacyHandler<(key: "ads", next: boolean) => Promise<void>>("toggleExternalPreference", screen.bindings);

    await toggle("ads", true);

    expect(stored()).toEqual({ chat_autosave: false, ads: true });
    expect(grantsFor("chat_autosave")).toEqual([]);
    expect(screen.shown.ads).toEqual([true]);
  });

  test("이 화면에는 전체 객체를 쓰는 저장이 남아 있지 않다", () => {
    const source = readFileSync(SCREEN_FILE, "utf8");
    const at = source.indexOf("export function DeepSpacePrivacyDesignScreen(");
    const end = source.indexOf("\nexport function", at + 10);
    expect(at).toBeGreaterThan(0);
    const screen = source.slice(at, end < 0 ? undefined : end);
    expect(screen).toContain("savePrivacyPref(");
    expect(screen).not.toContain("savePrivacyPrefs(");
  });
});
