// 대화 자동 저장 토글이 **배송되는** /privacy 에 있는가 (Q-260914-01, 2026-09-14).
//
// 켜는 토글은 PrivacyLegacy 의 VISIBLE_PRIVACY_KEYS.map 에만 있었고, 그 반쪽은
// isDeepSpaceUI() 분기 뒤라 어느 배포도 그리지 않는다. 배송 화면
// (DeepSpacePrivacyDesignScreen)에는 chat_autosave 가 0건이었다. enforcer 는 있는데
// 켤 방법이 없는 상태였다. autosave.test.ts 의 "설정 화면에 보인다" 는 키 목록만
// 봐서 그걸 못 봤다.
//
// 그래서 여기서는 셋을 본다:
//   · 저장 경로가 동의 원장을 거친다 (순수 함수 + 실제 savePrivacyPrefs, DB 만 목)
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

import { MINOR_PROMOTABLE_KEYS, defaultPrivacyPrefs, nextPrivacyPrefs, type PrivacyPrefs } from "../prefs";
import { savePrivacyPrefs } from "../../supabase/privacy";

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

describe("저장 경로가 동의 원장을 거친다 (savePrivacyPrefs -> consent_changes)", () => {
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
    const next = nextPrivacyPrefs(defaultPrivacyPrefs(), "chat_autosave", true, true);
    expect(next).not.toBeNull();
    await savePrivacyPrefs("u1", next!, { locale: "ko" });
    expect(__update).toHaveBeenCalledWith({ privacy_prefs: next });
    expect(__insert).toHaveBeenCalledWith([{ user_id: "u1", pref_key: "chat_autosave", event_type: "grant" }]);
  });

  it("끄면 chat_autosave revoke 한 줄이 남는다 - 철회도 기록이다", async () => {
    __maybeSingle.mockResolvedValueOnce({ data: { privacy_prefs: { chat_autosave: true } }, error: null });
    const next = nextPrivacyPrefs({ ...defaultPrivacyPrefs(), chat_autosave: true }, "chat_autosave", false, true);
    expect(next).not.toBeNull();
    await savePrivacyPrefs("u1", next!);
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

  it("기본값은 꺼짐이다 - 못 읽었으면 그리지 않고, 저장된 참만 켜짐이다", () => {
    expect(screen).toContain("const [chatSaveOn, setChatSaveOn] = useState<boolean | null>(null);");
    expect(screen).toContain("setChatSaveOn(p.chat_autosave === true)");
    expect(screen).toContain("chatSaveOn === null ? (");
  });

  it("같은 저장 경로를 쓴다", () => {
    expect(handler).toContain("await savePrivacyPrefs(targetUserId, updated");
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

describe("카드 문구", () => {
  const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
  const KEYS = ["chatSaveSection", "chatSaveLoading", "chatSaveError"] as const;
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
    expect(privacy("ko").chatSaveError).toMatch(/요\./);
    expect(privacy("ko").chatSaveError).not.toMatch(/니다\./);
  });
});
