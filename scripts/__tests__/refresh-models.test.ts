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
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ANTHROPIC_OPUS_PURPOSES,
  ANTHROPIC_SONNET_PURPOSES,
  COST_AXIS,
  OPENAI_FRONTIER_PURPOSES,
  SEATS,
  costAxisOf,
  pickNewest,
  secretsFor,
  type SeatClass,
} from "../refresh-models";

function seat(id: string): SeatClass {
  const found = SEATS.find((s) => s.id === id);
  if (!found) throw new Error(`좌석 정의가 사라졌다: ${id}`);
  return found;
}

const SONNET = seat("anthropic-sonnet");
const OPUS = seat("anthropic-opus");
const GPT = seat("openai-frontier");
// Gemini 좌석 3개는 2026-08-21 에 제거됐다 (REQ-260821-01). 모양 허용 목록의
// 성질을 시험하던 자리를 xAI 좌석이 이어받는다 - 같은 성질을 같은 방식으로
// 시험하므로 커버리지가 줄지 않는다.
const XAI = seat("xai-frontier");

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
    const all = ["grok-4", "grok-5-beta", "grok-5-preview"];
    expect(pickNewest(all, XAI)).toBe("grok-4");
  });

  it("flash 와 flash-lite 를 서로 침범하지 않는다", () => {
    // flash 패턴이 느슨하면 flash-lite 를 삼켜서 OCR 좌석이 조용히 경량 모델로 내려간다.
    // 같은 벤더 안에서도 좌석이 자기 모양만 가져간다: grok-4-fast 는 축이 달라
    // 프론티어 좌석에 올라오면 안 된다.
    const all = ["grok-4", "grok-4-fast"];
    expect(pickNewest(all, XAI)).toBe("grok-4");
  });

  it("등급에 아무것도 없으면 null 을 준다 (엉뚱한 것을 고르지 않는다)", () => {
    expect(pickNewest(["gpt-5.6", "grok-4"], OPUS)).toBeNull();
    expect(pickNewest([], SONNET)).toBeNull();
  });

  it("Simon 이 알려준 현재 세대를 실제로 집어낸다", () => {
    // 2026-08-17 기준 gpt-5.6 / gemini-3.7-flash. 이 테스트는 시간이 지나면
    // 낡지만, 낡는다는 사실 자체가 이 스크립트가 필요한 이유다.
    expect(pickNewest(["gpt-5.4", "gpt-5.6"], GPT)).toBe("gpt-5.6");
    expect(pickNewest(["grok-4", "grok-4.1"], XAI)).toBe("grok-4.1");
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
    expect(costAxisOf("xai-frontier")).toBe("deep");
    expect(costAxisOf("anthropic-opus")).toBe("deep");
    expect(costAxisOf("openai-frontier")).toBe("deep");
    expect(costAxisOf("anthropic-sonnet")).toBe("mid");
  });

  it("모르는 좌석은 축이 없어 승격 대상이 아니다", () => {
    expect(costAxisOf("something-new")).toBeNull();
  });
});

// ── 승격을 실제로 어떤 시크릿으로 쓰는가 ──────────────────────────────
//
// 위의 COST_AXIS 시험은 **무엇을 고르는지**만 본다. 2026-08-20 에 밝혀진 것은
// 고르는 쪽이 아니라 **쓰는 쪽**이 축을 넘고 있었다는 것이다: openai-frontier
// 승격이 `OPENAI_MODEL` 로 기록됐는데 그건 좌석값이 아니라 전역 킬스위치라서
// openai-proxy 의 내장 좌석을 전부 덮었다. `safety_classify`(gpt-5.4-nano) 까지.
//
// 그래서 여기서는 선택이 아니라 **기록된 시크릿**을 시험한다.
describe("secretsFor — 승격이 좌석 밖으로 새지 않는다", () => {
  it("openai 승격을 전역 킬스위치로 쓰지 않는다", () => {
    const out = secretsFor([{ seat: { id: "openai-frontier" }, chosen: "gpt-5.5" }]);
    const names = out.map((s) => s.name);
    expect(names).toContain("OPENAI_PURPOSE_MODELS");
    // 이 한 줄이 회귀 방지선이다. OPENAI_MODEL 은 사람이 사고 대응으로 쓰는 손잡이지
    // 자동 승격이 만질 것이 아니다.
    expect(names).not.toContain("OPENAI_MODEL");
  });

  it("싼 좌석 safety_classify 를 프론티어로 끌어올리지 않는다", () => {
    const out = secretsFor([{ seat: { id: "openai-frontier" }, chosen: "gpt-5.5" }]);
    const map = JSON.parse(out.find((s) => s.name === "OPENAI_PURPOSE_MODELS")!.value);
    expect(Object.keys(map)).not.toContain("safety_classify");
  });

  it("anthropic 승격은 opus 목적에만 닿는다 (sonnet 좌석 없음)", () => {
    // 2026-08-23: Simon 이 Anthropic 을 opus 전용으로 확정해서 sonnet 목적 목록이
    // 비었다. 승격 자체는 여전히 두 등급을 다 발견하지만, **쓰이는 것은 opus 뿐**이다.
    const out = secretsFor([
      { seat: { id: "anthropic-sonnet" }, chosen: "claude-sonnet-6" },
      { seat: { id: "anthropic-opus" }, chosen: "claude-opus-6" },
    ]);
    const map = JSON.parse(out.find((s) => s.name === "ANTHROPIC_PURPOSE_MODELS")!.value);
    expect(map.persona_narrative).toBe("claude-opus-6");
    // 발견된 sonnet 이름이 어느 목적에도 새어 들어가지 않는다 — 이게 이 시험의 핵심이다.
    expect(Object.values(map)).not.toContain("claude-sonnet-6");
    expect(map.advisor).toBeUndefined();
    expect(map.secondb_chat).toBeUndefined();
    // 그리고 opus 목적 넷은 전부 실려야 한다 (조용히 비는 맵이 더 나쁘다).
    expect(Object.keys(map).sort()).toEqual(
      ["axis_estimate", "digest_weekly", "persona_narrative", "persona_synthesis"].sort(),
    );
  });

  it("xai 좌석은 좌석당 시크릿 하나다", () => {
    const out = secretsFor([{ seat: { id: "xai-frontier" }, chosen: "grok-4.1" }]);
    expect(out).toEqual([{ name: "XAI_MODEL", value: "grok-4.1" }]);
  });

  it("승격이 없으면 아무 시크릿도 쓰지 않는다", () => {
    expect(secretsFor([])).toEqual([]);
    expect(secretsFor([{ seat: { id: "openai-frontier" }, chosen: null }])).toEqual([]);
  });
});

// 목적 목록은 엣지 프록시 좌석표의 **손으로 맞춘 사본**이다. 사본은 언젠가
// 어긋난다 — 그때 조용히 어긋나지 않게 프록시 파일을 직접 읽어 대조한다.
// (이 저장소가 이미 배운 교훈이다: 사본을 검사하는 시험은 진짜 정의가 무엇이든
// 통과한다. 파일 상단의 2026-08-18 회귀 주석 참조.)
describe("좌석 목록 표류 가드 — 엣지 프록시 원본과 대조", () => {
  function purposeModelOf(file: string): Record<string, string> {
    const src = readFileSync(path.join(__dirname, "../..", file), "utf8");
    const block = src.match(/const PURPOSE_MODEL: Record<string, string> = \{([\s\S]*?)\n\};/);
    if (!block) throw new Error(`${file} 에서 PURPOSE_MODEL 을 못 찾았다`);
    const seats: Record<string, string> = {};
    for (const m of block[1].matchAll(/^\s*([a-z_]+):\s*'([^']+)'/gm)) seats[m[1]] = m[2];
    if (Object.keys(seats).length === 0) throw new Error(`${file} 의 PURPOSE_MODEL 이 비었다`);
    return seats;
  }

  it("openai: 프론티어 좌석 전부를 담고, 싼 좌석은 안 담는다", () => {
    const seats = purposeModelOf("supabase/functions/openai-proxy/index.ts");
    // 싼 축은 이름에 티어 접미사가 붙는다 (gpt-5.4-nano / -mini).
    const cheap = Object.keys(seats).filter((p) => /-(nano|mini)$/.test(seats[p]));
    const frontier = Object.keys(seats).filter((p) => !cheap.includes(p));
    // The cheap axis is now eight seats: the safety classifier plus the seven
    // backbone purposes that PURPOSE_TIER already called lite or flash. Listed
    // rather than counted, so adding a seat here is a deliberate edit.
    expect(cheap.sort()).toEqual(
      [
        "audit_qa",
        "capture_classify",
        "clipper_classify",
        "clipper_template_propose",
        "import_ingest",
        "interview_probe",
        "safety_classify",
        "source_ingest",
      ].sort(),
    );
    expect([...OPENAI_FRONTIER_PURPOSES].sort()).toEqual(frontier.sort());
    for (const c of cheap) expect(OPENAI_FRONTIER_PURPOSES).not.toContain(c);
  });

  it("anthropic: sonnet·opus 목록이 프록시 좌석표와 같다", () => {
    const seats = purposeModelOf("supabase/functions/claude-proxy/index.ts");
    const sonnet = Object.keys(seats).filter((p) => seats[p].includes("sonnet"));
    const opus = Object.keys(seats).filter((p) => seats[p].includes("opus"));
    expect([...ANTHROPIC_SONNET_PURPOSES].sort()).toEqual(sonnet.sort());
    expect([...ANTHROPIC_OPUS_PURPOSES].sort()).toEqual(opus.sort());
    // 두 등급이 같은 목적을 다투지 않는다.
    expect(sonnet.filter((p) => opus.includes(p))).toEqual([]);
  });
});

// 핀이 실제로 되돌리는가. 2026-08-19 이전에는 안 됐다 — 핀이 `skipped` 를 세워서
// 좌석이 `promotable` 필터에서 통째로 빠졌고, 그래서 이미 적용된 승격이 그대로
// 남았다. 파일 헤더와 실행 끝 안내가 둘 다 핀을 되돌리기 수단으로 말하고 있었다.
describe("MODEL_PIN 은 되돌리기 수단이다", () => {
  it("핀 값이 시크릿에 실제로 쓰인다", () => {
    // 핀이 안 쓰이면 이 배열이 비고, 되돌릴 길이 없다는 뜻이다.
    const out = secretsFor([{ seat: { id: "openai-frontier" }, chosen: "gpt-5.4" }]);
    const map = JSON.parse(out.find((s) => s.name === "OPENAI_PURPOSE_MODELS")!.value);
    expect(map.secondb_chat).toBe("gpt-5.4");
  });

  it("핀 좌석은 skipped 로 표시되지 않는다", async () => {
    // `promotable` 은 `d.chosen && !d.skipped` 로 거른다. 핀이 skipped 를 세우면
    // chosen 이 있어도 적용에서 빠진다 — 그게 원래 결함이었다.
    const src = readFileSync(path.join(__dirname, "..", "refresh-models.ts"), "utf8");
    const pinBlock = src.slice(src.indexOf("const pin ="), src.indexOf("const pin =") + 1600);
    expect(pinBlock).toContain("out.push({ seat, candidates: [], chosen: pin });");
    expect(pinBlock).not.toMatch(/chosen: pin, skipped:/);
  });
});
