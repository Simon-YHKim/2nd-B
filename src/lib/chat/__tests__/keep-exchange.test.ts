import {
  CHAT_KEEP_TAG,
  KEEP_MAX_CHARS,
  composeExchangeBody,
  exchangeTopic,
  findPrompt,
  isKeepable,
  type KeepableTurn,
} from "../keep-exchange";

const u = (text: string): KeepableTurn => ({ role: "user", text });
const b = (text: string): KeepableTurn => ({ role: "secondb", text });
const syn = (text: string): KeepableTurn => ({ role: "secondb", text, synthetic: true });

describe("isKeepable", () => {
  it("세컨비의 진짜 답변만 담는다", () => {
    expect(isKeepable(b("어제 기록에서 반복되는 게 있습니다"))).toBe(true);
  });

  it("인사말·오류 문구는 담지 않는다", () => {
    // synthetic 은 앱이 만든 문장이다. 사용자가 남긴 것도, 세컨비가 기록에서
    // 관찰한 것도 아니라 위키에 들어가면 잡음만 된다.
    expect(isKeepable(syn("안녕하세요, 세컨비입니다"))).toBe(false);
  });

  it("사용자 발화 자체는 담기 버튼의 주인이 아니다", () => {
    expect(isKeepable(u("요즘 잠을 잘 못 자"))).toBe(false);
  });

  it("빈 답변은 담지 않는다", () => {
    expect(isKeepable(b("   "))).toBe(false);
  });
});

describe("findPrompt", () => {
  it("답변 앞의 사용자 발화를 찾는다", () => {
    const turns = [u("요즘 잠을 잘 못 자"), b("기록을 보면 늦게 자는 날이 많았습니다")];
    expect(findPrompt(turns, 1)).toBe("요즘 잠을 잘 못 자");
  });

  it("중간에 인사말이 껴 있어도 넘어서 찾는다", () => {
    // 세컨비가 연달아 말하는 경우가 있다. 바로 앞 턴만 보면 짝을 놓친다.
    const turns = [u("요즘 잠을 잘 못 자"), syn("생각 중입니다"), b("늦게 자는 날이 많았습니다")];
    expect(findPrompt(turns, 2)).toBe("요즘 잠을 잘 못 자");
  });

  it("앞선 답변을 만나면 멈춘다 (남의 짝을 훔치지 않는다)", () => {
    // 이게 없으면 두 번째 답변이 첫 번째 질문을 자기 짝으로 가져가서,
    // 저장된 기록이 실제로 오간 대화와 달라진다.
    const turns = [u("첫 질문"), b("첫 답변"), b("이어지는 답변")];
    expect(findPrompt(turns, 2)).toBeNull();
  });

  it("첫 턴이면 짝이 없다", () => {
    expect(findPrompt([b("먼저 건넨 말")], 0)).toBeNull();
  });
});

describe("composeExchangeBody", () => {
  it("누가 한 말인지 구분해서 담는다", () => {
    // 구분이 없으면 이 기록이 나중에 다시 대화 맥락으로 들어갔을 때
    // 모델이 자기가 쓴 문장을 사용자의 기록으로 읽는다.
    const body = composeExchangeBody(
      { prompt: "요즘 잠을 잘 못 자", reply: "늦게 자는 날이 많았습니다", speaker: "세컨비" },
      "ko",
    );
    expect(body).toContain("**물어본 것**");
    expect(body).toContain("> 요즘 잠을 잘 못 자");
    expect(body).toContain("**세컨비**");
    expect(body).toContain("늦게 자는 날이 많았습니다");
  });

  it("짝이 없으면 답변만 담고 빈 인용을 만들지 않는다", () => {
    const body = composeExchangeBody({ prompt: null, reply: "먼저 건넨 말", speaker: "세컨비" }, "ko");
    expect(body).not.toContain("물어본 것");
    expect(body.startsWith("**세컨비**")).toBe(true);
  });

  it("여러 줄 질문도 인용이 끊기지 않는다", () => {
    const body = composeExchangeBody({ prompt: "첫 줄\n둘째 줄", reply: "답", speaker: "세컨비" }, "ko");
    expect(body).toContain("> 첫 줄\n> 둘째 줄");
  });

  it("길면 자르고 잘렸다고 표시한다", () => {
    const body = composeExchangeBody(
      { prompt: null, reply: "가".repeat(KEEP_MAX_CHARS + 500), speaker: "세컨비" },
      "ko",
    );
    expect(body).toContain("…");
    expect(body.length).toBeLessThan(KEEP_MAX_CHARS + 200);
  });

  it("영어 로케일은 한국어 라벨을 쓰지 않는다", () => {
    const body = composeExchangeBody({ prompt: "why", reply: "because", speaker: "SecondB" }, "en");
    expect(body).toContain("**I asked**");
    expect(/[가-힣]/.test(body)).toBe(false);
  });
});

describe("exchangeTopic", () => {
  it("사용자가 물어본 말을 제목으로 쓴다", () => {
    // 나중에 목록에서 찾을 때 사람은 자기가 무엇을 물었는지로 기억한다.
    expect(exchangeTopic("요즘 잠을 잘 못 자", "늦게 자는 날이 많았습니다")).toBe("요즘 잠을 잘 못 자");
  });

  it("짝이 없으면 답변 첫 줄을 쓴다", () => {
    expect(exchangeTopic(null, "먼저 건넨 말\n둘째 줄")).toBe("먼저 건넨 말");
  });

  it("80자에서 자른다", () => {
    expect(exchangeTopic("가".repeat(200), "x").length).toBeLessThanOrEqual(81);
  });
});

describe("태그", () => {
  it("도메인 태그가 아니다", () => {
    // domain: 태그가 붙으면 별 밝기가 올라간다. 대화를 담았다고 해서 그 영역을
    // 더 아는 것은 아니므로, 밝기를 건드리지 않는 태그여야 한다.
    expect(CHAT_KEEP_TAG.startsWith("domain:")).toBe(false);
  });
});
