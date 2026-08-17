// 등급 선택 로직만 검증한다. 벤더 API 호출과 스모크 테스트는 네트워크라 여기 없다.
//
// 여기서 지키려는 것: "제일 새 모델"이 아니라 "이 등급에서 제일 새 모델"이라는 것.
// 그 구분이 무너지면 대화 좌석이 어느 날 실험판이나 엉뚱한 티어로 건너뛴다.
import { pickNewest } from "../refresh-models";

// SEATS 와 같은 모양이되, 테스트가 정의를 직접 들고 있어야 회귀를 잡는다.
const SONNET = { id: "anthropic-sonnet", vendor: "anthropic" as const, match: /^claude-sonnet-/, exclude: /preview|beta|latest/, note: "" };
const OPUS = { id: "anthropic-opus", vendor: "anthropic" as const, match: /^claude-opus-/, exclude: /preview|beta|latest/, note: "" };
const GPT = { id: "openai-frontier", vendor: "openai" as const, match: /^gpt-\d/, exclude: /mini|nano|audio|realtime|image|preview|turbo|instruct/, note: "" };
const FLASH = { id: "google-flash", vendor: "google" as const, match: /^models\/gemini-[\d.]+-flash$/, exclude: /preview|exp|thinking/, note: "" };
const FLASH_LITE = { id: "google-flash-lite", vendor: "google" as const, match: /^models\/gemini-[\d.]+-flash-lite$/, exclude: /preview|exp/, note: "" };

describe("pickNewest", () => {
  it("등급 안에서만 최신을 고른다", () => {
    const all = ["claude-sonnet-4", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-5"];
    expect(pickNewest(all, SONNET)).toBe("claude-sonnet-5");
    expect(pickNewest(all, OPUS)).toBe("claude-opus-5");
  });

  it("소수점 버전을 자리별로 비교한다", () => {
    // 문자열 정렬이면 "gpt-5.6" < "gpt-5.10" 을 틀린다. 자리별 숫자 비교여야 한다.
    expect(pickNewest(["gpt-5.4", "gpt-5.6", "gpt-5.10"], GPT)).toBe("gpt-5.10");
    expect(pickNewest(["gpt-5.6", "gpt-5.4"], GPT)).toBe("gpt-5.6");
  });

  it("추론 좌석에 mini·nano·오디오 변형을 고르지 않는다", () => {
    // 이 걸러내기가 없으면 어느 날 대화가 mini 로 강등돼도 아무도 모른다.
    const all = ["gpt-5.6", "gpt-5.9-mini", "gpt-5.9-nano", "gpt-5.9-audio", "gpt-5.9-realtime"];
    expect(pickNewest(all, GPT)).toBe("gpt-5.6");
  });

  it("preview·exp 를 고르지 않는다", () => {
    const all = ["models/gemini-3.5-flash", "models/gemini-4.0-flash-preview", "models/gemini-4.0-flash-exp"];
    expect(pickNewest(all, FLASH)).toBe("models/gemini-3.5-flash");
  });

  it("flash 와 flash-lite 를 서로 침범하지 않는다", () => {
    // flash 패턴이 느슨하면 flash-lite 를 삼켜서 OCR 좌석이 조용히 경량 모델로 내려간다.
    const all = ["models/gemini-3.7-flash", "models/gemini-3.9-flash-lite"];
    expect(pickNewest(all, FLASH)).toBe("models/gemini-3.7-flash");
    expect(pickNewest(all, FLASH_LITE)).toBe("models/gemini-3.9-flash-lite");
  });

  it("등급에 아무것도 없으면 null 을 준다 (엉뚱한 것을 고르지 않는다)", () => {
    expect(pickNewest(["gpt-5.6", "models/gemini-3.7-flash"], OPUS)).toBeNull();
    expect(pickNewest([], SONNET)).toBeNull();
  });

  it("Simon 이 알려준 현재 세대를 실제로 집어낸다", () => {
    // 2026-08-17 기준 gpt-5.6 / gemini-3.7-flash. 이 테스트는 시간이 지나면
    // 낡지만, 낡는다는 사실 자체가 이 스크립트가 필요한 이유다.
    expect(pickNewest(["gpt-5.4", "gpt-5.6"], GPT)).toBe("gpt-5.6");
    expect(pickNewest(["models/gemini-3.5-flash", "models/gemini-3.7-flash"], FLASH)).toBe("models/gemini-3.7-flash");
  });
});
