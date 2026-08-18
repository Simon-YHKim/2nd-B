// 등급 선택 로직만 검증한다. 벤더 API 호출과 스모크 테스트는 네트워크라 여기 없다.
//
// 여기서 지키려는 것: "제일 새 모델"이 아니라 "이 등급에서 제일 새 모델"이라는 것.
// 그 구분이 무너지면 대화 좌석이 어느 날 실험판이나 엉뚱한 티어로 건너뛴다.
//
// ⚠ **이 파일은 SEATS 사본을 만들지 않는다.** 예전에는 "테스트가 정의를 직접 들고
// 있어야 회귀를 잡는다"며 같은 모양의 상수를 따로 선언했는데, 그건 정반대로 작동했다:
// 사본을 검사하니 진짜 정의가 무엇이든 테스트는 통과했다. 2026-08-18 dry-run 이
// 찾아낸 검색-모델 구멍(`gpt-5-search-api-2025-10-14` 가 추론 좌석 후보로 올라옴)이
// 바로 그 사각지대에 있었다 — 테스트는 그때도 전부 초록이었다.
// 이제는 실제 SEATS 를 import 해서 **배포되는 정의 자체**를 시험한다.
import { COST_AXIS, SEATS, costAxisOf, pickNewest, type SeatClass } from "../refresh-models";

function seat(id: string): SeatClass {
  const found = SEATS.find((s) => s.id === id);
  if (!found) throw new Error(`좌석 정의가 사라졌다: ${id}`);
  return found;
}

const SONNET = seat("anthropic-sonnet");
const OPUS = seat("anthropic-opus");
const GPT = seat("openai-frontier");
const FLASH = seat("google-flash");
const FLASH_LITE = seat("google-flash-lite");

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

  // ── 2026-08-18 회귀 ────────────────────────────────────────────────
  //
  // 콘솔이 dry-run(run 32135458171)에서 실측한 사고다. 추론 좌석 9개가 **검색
  // 전용** 모델로 승격될 뻔했고, MODEL_REFRESH_APPLY 가 false 였던 것만이
  // 막고 있었다. 스모크 테스트는 이걸 못 잡는다 — 검색 모델도 {"ok":true} 는
  // 정상적으로 뱉으므로 "시험 통과" 가 뜬다.
  it("검색 전용 변형을 추론 좌석으로 승격하지 않는다", () => {
    const real = ["gpt-5.4", "gpt-5-search-api-2025-10-14"];
    expect(pickNewest(real, GPT)).toBe("gpt-5.4");
    // 그 이름 하나만 있으면 아예 고르지 않는다 (= 쓰던 모델 유지).
    expect(pickNewest(["gpt-5-search-api-2025-10-14"], GPT)).toBeNull();
  });

  it("전용 변형 일반을 추론 좌석으로 승격하지 않는다", () => {
    // search 하나만 막으면 다음 변형에서 똑같이 뚫린다. 좌석은 **모양**으로 닫혀 있다.
    for (const specialised of [
      "gpt-5.9-search-api",
      "gpt-5.9-codex",
      "gpt-5.9-transcribe",
      "gpt-5.9-tts",
      "gpt-5.9-instruct",
      "gpt-5.9-turbo",
      "gpt-5.9-preview",
      "gpt-4o", // 접미사가 붙은 구세대 이름도 세대 슬러그가 아니다
    ]) {
      expect(pickNewest([specialised], GPT)).toBeNull();
    }
  });

  it("날짜 스냅샷이 세대 슬러그를 이기지 못한다", () => {
    // versionKey 가 이름 안의 숫자를 전부 버전으로 읽어서 gpt-5-2025-08-07 은
    // [5,2025,8,7] 이 된다. 둘째 자리에서 2025 > 4 라 날짜가 항상 이긴다.
    // 좌석 match 가 접미사 없는 슬러그만 받아 그 비교 자체를 성립시키지 않는다.
    expect(pickNewest(["gpt-5.4", "gpt-5-2025-08-07"], GPT)).toBe("gpt-5.4");
  });

  it("정상적인 세대 슬러그는 계속 통과한다", () => {
    // 과하게 잠그면 승격이 영영 안 된다. 이 좌석이 실제로 쓰는 모양은 통과해야 한다.
    for (const ok of ["gpt-5", "gpt-5.4", "gpt-5.10", "gpt-4.1"]) {
      expect(pickNewest([ok], GPT)).toBe(ok);
    }
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

// 좌석 정의 자체의 불변식. 이름 목록을 통과시키기 전에 정의가 성립하는지 본다.
describe("좌석 정의", () => {
  it("좌석 id 가 중복되지 않는다", () => {
    const ids = SEATS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 좌석이 비용 축에 배정돼 있다", () => {
    // 축이 없는 좌석은 승격 경로에 조용히 빠진다. 새 좌석을 추가하고 축을
    // 잊는 것이 가장 흔한 실수다.
    for (const s of SEATS) expect(costAxisOf(s.id)).not.toBeNull();
  });

  it("match 와 exclude 가 전역 플래그를 쓰지 않는다", () => {
    // /g 정규식은 lastIndex 를 들고 다녀서 test() 호출마다 결과가 달라진다.
    // pickNewest 는 같은 정규식을 목록 전체에 반복 적용하므로 치명적이다.
    for (const s of SEATS) {
      expect(s.match.global).toBe(false);
      expect(s.exclude?.global ?? false).toBe(false);
    }
  });
});

// 비용 축. 자동 승격이 축을 넘나들면 요금이 튀거나 품질이 조용히 내려간다.
describe("비용 축", () => {
  it("모든 좌석이 정확히 한 축에만 속한다", () => {
    const all = Object.values(COST_AXIS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("싼 좌석과 깊은 좌석이 섞이지 않는다", () => {
    // 분류 좌석이 프론티어로 올라가면 요금이 튀고, 종합 좌석이 lite 로
    // 내려가면 품질이 조용히 떨어진다. 둘 다 알아채기 어렵다.
    expect(costAxisOf("google-flash-lite")).toBe("cheap");
    expect(costAxisOf("anthropic-opus")).toBe("deep");
    expect(costAxisOf("openai-frontier")).toBe("deep");
    expect(costAxisOf("anthropic-sonnet")).toBe("mid");
  });

  it("모르는 좌석은 축이 없어 승격 대상이 아니다", () => {
    expect(costAxisOf("something-new")).toBeNull();
  });
});
