// 대화 저장 안내가 **뜨면 안 되는 자리에서 안 뜨는지**가 핵심이다.
// 잘못 뜨면 두 가지가 망가진다:
//   - 자동 저장이 켜져 있는데 "안 남아요" 라고 하면 **거짓말**이다
//   - 매번 뜨면 안내가 아니라 압박(다크패턴)이다
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { shouldShowChatSaveNotice } from "../save-notice";

const base = { autosaveConsent: false as boolean | null, dismissed: false as boolean | null, turnCount: 3 };

describe("대화 저장 안내를 언제 보이나", () => {
  it("자동 저장이 꺼져 있고 아직 안 닫았고 오간 말이 있으면 보인다", () => {
    expect(shouldShowChatSaveNotice(base)).toBe(true);
  });

  it("자동 저장이 켜져 있으면 안 보인다", () => {
    // 켜져 있는데 "안 남아요" 는 거짓말이다.
    expect(shouldShowChatSaveNotice({ ...base, autosaveConsent: true })).toBe(false);
  });

  it("아직 모를 때(null)는 안 보인다", () => {
    // prefs 조회 중에 띄웠다가 켜져 있던 것으로 밝혀지면 틀린 말을 한 것이 된다.
    // fail-closed: 모르면 말하지 않는다.
    expect(shouldShowChatSaveNotice({ ...base, autosaveConsent: null })).toBe(false);
  });

  it("한 번 닫으면 다시 안 보인다", () => {
    expect(shouldShowChatSaveNotice({ ...base, dismissed: true })).toBe(false);
  });

  it("닫았는지 아직 모를 때(null)도 안 보인다", () => {
    // 네이티브 저장소 조회 전에 띄우면 **이미 닫은 사람에게 다시** 보인다.
    expect(shouldShowChatSaveNotice({ ...base, dismissed: null })).toBe(false);
  });

  it("오간 말이 없으면 안 보인다", () => {
    // 빈 화면에서 "안 남아요" 는 알릴 것이 없는 상태의 경고다.
    expect(shouldShowChatSaveNotice({ ...base, turnCount: 0 })).toBe(false);
  });
});

describe("화면 배선", () => {
  const src = readFileSync(join(process.cwd(), "src", "app", "secondb.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("판정 함수를 거쳐서 그린다", () => {
    // 화면이 조건을 직접 다시 쓰면 위 규칙과 갈라진다.
    expect(src).toContain("shouldShowChatSaveNotice({");
    expect(src).toContain("useChatSaveNoticeDismissed");
  });

  it("설정으로 가는 길과 닫는 길을 둘 다 준다", () => {
    // 닫기만 있으면 켜는 방법을 못 찾고, 열기만 있으면 빠져나갈 수 없다.
    expect(src).toContain("chatSaveNoticeOpen");
    expect(src).toContain("chatSaveNoticeDismiss");
    expect(src).toContain('router.push("/privacy")');
  });

  it("문구가 로케일에서 온다", () => {
    for (const key of ["chatSaveNotice", "chatSaveNoticeBody"]) {
      expect(src).toContain(`t("${key}")`);
    }
    const ko = JSON.parse(
      readFileSync(join(process.cwd(), "locales", "ko", "secondb.json"), "utf8"),
    ) as Record<string, string>;
    expect(ko.chatSaveNotice.length).toBeGreaterThan(0);
    // 켜기 전 대화는 저장되지 않는다는 사실을 빠뜨리면 안 된다 — 켜자마자
    // 지난 대화가 다 남을 거라고 기대하게 된다.
    expect(ko.chatSaveNoticeBody).toContain("켜기 전");
  });
});
