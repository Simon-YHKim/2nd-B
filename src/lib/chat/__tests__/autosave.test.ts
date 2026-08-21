// 대화 자동 저장 게이트 (Simon 2026-08-18).
//
// 이 스위치가 바꾸는 것은 기능이 아니라 **보관 기간**이다. 지금 대화는 휘발성이라
// (저장소에 대화 테이블이 없다) 켜는 순간 사라지던 말이 남는 말이 된다. 그래서
// 여기 검사는 "동작하는가" 보다 **"켜지 않았는데 저장되지 않는가"** 를 지킨다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chatAutosaveAllowed } from "../autosave";
import {
  MINOR_PROMOTABLE_KEYS,
  PRIVACY_PREF_KEYS,
  VISIBLE_PRIVACY_KEYS,
  defaultPrivacyPrefs,
  isPrivacyPrefEditable,
  resolvePrivacyPrefs,
} from "../../privacy/prefs";

const ROOT = join(__dirname, "..", "..", "..", "..");

describe("chatAutosaveAllowed", () => {
  it("명시적으로 켠 경우에만 참이다", () => {
    expect(chatAutosaveAllowed(true)).toBe(true);
  });

  it("모르는 상태는 전부 거짓으로 떨어진다 (fail-closed)", () => {
    // null 은 "아직 프리퍼런스를 못 읽었다" 이다. 그 창에서 저장이 돌면
    // 동의 없이 남는 말이 생긴다.
    for (const v of [false, null, undefined]) {
      expect(chatAutosaveAllowed(v)).toBe(false);
    }
  });
});

describe("chat_autosave 프리퍼런스 계약", () => {
  it("기본값이 꺼져 있다", () => {
    // privacy-by-design. 사용자가 "사라진다고 생각하고 한 말" 이 기본으로 남으면
    // 안 된다.
    expect(defaultPrivacyPrefs().chat_autosave).toBe(false);
    expect(resolvePrivacyPrefs(null).chat_autosave).toBe(false);
    expect(resolvePrivacyPrefs({}).chat_autosave).toBe(false);
  });

  it("저장된 참만 참으로 산다", () => {
    expect(resolvePrivacyPrefs({ chat_autosave: true }).chat_autosave).toBe(true);
    // 문자열 "true" 같은 것이 참으로 승격되면 안 된다.
    expect(resolvePrivacyPrefs({ chat_autosave: "true" }).chat_autosave).toBe(false);
  });

  it("키 집합에 있고 설정 화면에 보인다", () => {
    expect(PRIVACY_PREF_KEYS).toContain("chat_autosave");
    // D-12 정직성 규칙: enforcer 없는 토글은 거짓 약속이다. 반대로 enforcer 가
    // 있는데 토글이 없으면 사용자가 켤 방법이 없다. 둘 다 있어야 한다.
    expect(VISIBLE_PRIVACY_KEYS).toContain("chat_autosave");
  });

  it("미성년도 스스로 켤 수 있다", () => {
    // 바깥으로 나가는 것이 없다 - 자기 말이 자기 위키로 갈 뿐이다. 막으면
    // 보호되는 것은 없고 그 사용자의 대화만 페르소나에 기여하지 못한다.
    expect(MINOR_PROMOTABLE_KEYS).toContain("chat_autosave");
    expect(isPrivacyPrefEditable("chat_autosave", true)).toBe(true);
    expect(isPrivacyPrefEditable("chat_autosave", false)).toBe(true);
  });
});

describe("대화 화면 배선", () => {
  const screen = readFileSync(join(ROOT, "src", "app", "secondb.tsx"), "utf8");

  it("게이트를 지나서만 자동 저장한다", () => {
    expect(screen).toContain("chatAutosaveAllowed(autosaveConsent)");
  });

  it("프리퍼런스를 못 읽으면 저장하지 않는다", () => {
    // fetch 실패 경로가 null 로 남으면 게이트가 열린 채 방치된다.
    expect(screen).toContain("setAutosaveConsent(false)");
  });

  it("자동 경로가 수동 경로와 같은 함수를 쓴다", () => {
    // 두 경로가 갈라지면 위기 안내(C9)나 dedup 이 한쪽에만 붙는다.
    expect(screen).toContain("void keepExchange(idx)");
  });

  it("동의 이전 대화를 소급해서 담지 않는다", () => {
    // 마지막 턴 하나만 본다. 화면에 남아 있는 과거 대화까지 담으면 동의를
    // 켜기 전에 한 말이 소급 저장된다.
    expect(screen).toContain("const idx = turns.length - 1;");
  });
});

describe("동의 문구", () => {
  const locales = ["en", "ko", "es", "pt", "id"] as const;
  const read = (loc: string) =>
    JSON.parse(readFileSync(join(ROOT, "locales", loc, "consent.json"), "utf8")) as {
      privacy: { keys: Record<string, { label: string; desc: string }> };
    };

  it("다섯 로케일 전부에 있다", () => {
    for (const loc of locales) {
      const v = read(loc).privacy.keys.chat_autosave;
      expect(typeof v?.label).toBe("string");
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.desc.length).toBeGreaterThan(0);
    }
  });

  it("사라진다는 사실을 문구가 말한다", () => {
    // 이 토글의 요점은 "켜면 남는다" 가 아니라 "끄면 사라진다" 이다. 그걸
    // 안 적으면 사용자는 무엇을 고르는지 모른다.
    expect(read("en").privacy.keys.chat_autosave.desc).toMatch(/gone|delete/i);
    expect(read("ko").privacy.keys.chat_autosave.desc).toContain("사라집니다");
  });

  it("검토되지 않은 로케일은 EN 사본이다", () => {
    // consent.json 은 사람이 검토한 로케일에만 자국어를 허용한다
    // (check:safety-consent-locale). 여기서도 같은 자세를 고정한다.
    const en = read("en").privacy.keys.chat_autosave;
    for (const loc of ["es", "pt", "id"] as const) {
      expect(read(loc).privacy.keys.chat_autosave).toEqual(en);
    }
  });
});
