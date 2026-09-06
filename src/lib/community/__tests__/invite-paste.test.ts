// 초대 링크 붙여넣기 파서 — 수신구가 받아야 할 입력 모양을 고정한다.
import { inviteTokenFromInput } from "../invite-paste";

describe("inviteTokenFromInput", () => {
  const token = "aB3_xY9-qWer12Zt";

  it("전체 공유 링크에서 토큰을 꺼낸다", () => {
    expect(inviteTokenFromInput(`https://simon-yhkim.github.io/2nd-B/community/join/${token}`)).toBe(token);
  });

  it("쿼리·해시·후행 슬래시가 붙어도 토큰만 남긴다", () => {
    expect(inviteTokenFromInput(`https://simon-yhkim.github.io/2nd-B/community/join/${token}?utm=x#top`)).toBe(token);
    expect(inviteTokenFromInput(`https://simon-yhkim.github.io/2nd-B/community/join/${token}/`)).toBe(token);
  });

  it("맨 토큰 붙여넣기도 받는다 (앞뒤 공백 포함)", () => {
    expect(inviteTokenFromInput(`  ${token}  `)).toBe(token);
  });

  it("토큰이 아닌 입력은 null — 짧은 문자열·일반 URL·빈 값", () => {
    expect(inviteTokenFromInput("")).toBeNull();
    expect(inviteTokenFromInput("   ")).toBeNull();
    expect(inviteTokenFromInput("short")).toBeNull();
    expect(inviteTokenFromInput("https://example.com/whatever")).toBeNull();
    expect(inviteTokenFromInput("한글 붙여넣기")).toBeNull();
  });

  it("링크 문장째 붙여넣어도 marker 뒤를 찾는다", () => {
    expect(
      inviteTokenFromInput(`같이 써요! https://simon-yhkim.github.io/2nd-B/community/join/${token} (14일 유효)`),
    ).toBe(token);
  });
});
