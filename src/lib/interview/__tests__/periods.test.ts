// 자리는 **별 일곱으로 고정**이고, 이 파일이 하는 일은 하나다 —
// **아직 살지 않은 자리를 가려낸다.**
//
// ⚠ 2026-08-24 에 역할이 바뀌었다. 예전에는 나이에서 시기 목록 자체를 만들어
// 사람마다 칸 수가 달랐는데(스물다섯 4개·마흔여섯 6개), 별자리는 모양이 있어야
// 하므로 칸은 고정이 됐다. 대신 살지 않은 별은 잠근다.
import { livedPeriods, lockedStars, parsePeriodParam } from "../periods";
import { LIFE_PERIODS, PERIOD_LABEL, seedQuestion, emptyCoverage } from "../probe";
import { SEVEN_STARS, hasInterview, isUnlived } from "../../persona/seven-stars";

describe("별 일곱이 정본이다", () => {
  it("일곱이다", () => {
    expect(SEVEN_STARS).toHaveLength(7);
  });

  it("Simon 이 정한 순서·이름 그대로", () => {
    expect(SEVEN_STARS.map((s) => s.id)).toEqual([
      "profile", "infancy", "school", "twenties", "later", "work", "now",
    ]);
  });

  it("인터뷰가 없는 별은 프로필 하나뿐", () => {
    const without = SEVEN_STARS.filter((s) => !hasInterview(s.id)).map((s) => s.id);
    expect(without).toEqual(["profile"]);
  });

  it("인터뷰가 있는 여섯이 LIFE_PERIODS 와 정확히 같다", () => {
    // 하나라도 어긋나면 별을 눌렀는데 못 여는 자리가 생긴다.
    const fromStars = SEVEN_STARS.filter((s) => s.period).map((s) => s.period);
    expect(fromStars).toEqual([...LIFE_PERIODS]);
  });

  it("⚠ 나이 경계에 구멍이 없다", () => {
    // Simon 원안은 영유아기(0~6) → 학창시절(7~18) → 20대 라 **19세가 비었다.**
    // 학창시절을 7~19 로 닫았다 — 한국에서 19세는 고3·재수·대학 1학년이다.
    const bands = SEVEN_STARS.map((s) => s.ageBand).filter((b): b is { from: number; to: number | null } => b !== null);
    expect(bands.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < bands.length - 1; i += 1) {
      const cur = bands[i], next = bands[i + 1];
      expect(cur.to).not.toBeNull();
      expect((cur.to as number) + 1).toBe(next.from); // 붙어 있어야 한다
    }
    expect(bands[bands.length - 1].to).toBeNull(); // 마지막은 위로 열려 있다
  });
});

describe("아직 살지 않은 자리를 잠근다", () => {
  it("스물다섯 살에게 30대 이후는 잠긴다", () => {
    expect(isUnlived("later", 25)).toBe(true);
    expect(lockedStars(25)).toEqual(["later"]);
  });

  it("마흔여섯 살은 아무것도 안 잠긴다", () => {
    expect(lockedStars(46)).toEqual([]);
  });

  it("주제 별(직장·지금)은 나이와 무관하게 언제나 열린다", () => {
    for (const age of [14, 25, 46, 80, null]) {
      expect(isUnlived("work", age)).toBe(false);
      expect(isUnlived("now", age)).toBe(false);
    }
  });

  it("나이를 모르면 막지 않는다 (막는 쪽이 더 나쁘다)", () => {
    expect(lockedStars(null)).toEqual([]);
    expect(livedPeriods(null)).toEqual([...LIFE_PERIODS]);
  });

  it("livedPeriods 가 잠긴 자리를 뺀다", () => {
    expect(livedPeriods(25)).toEqual(["infancy", "school", "twenties", "work", "now"]);
    expect(livedPeriods(46)).toEqual([...LIFE_PERIODS]);
  });

  it("열네 살에게도 20대는 잠긴다", () => {
    expect(lockedStars(14).sort()).toEqual(["later", "twenties"]);
  });
});

describe("여섯 자리를 엔진이 전부 감당한다", () => {
  it("ko·en 라벨이 다 있다", () => {
    for (const p of LIFE_PERIODS) {
      for (const loc of ["ko", "en"] as const) {
        expect(typeof PERIOD_LABEL[loc][p]).toBe("string");
        expect(PERIOD_LABEL[loc][p].length).toBeGreaterThan(0);
      }
    }
  });

  it("ko·en 씨앗 질문이 다 있고 전부 질문이다", () => {
    for (const p of LIFE_PERIODS) {
      for (const loc of ["ko", "en"] as const) {
        const q = seedQuestion(p, loc);
        expect(q).toContain("?");
        expect(q.length).toBeGreaterThan(15);
      }
    }
  });

  it("씨앗 질문이 자리마다 서로 다르다", () => {
    for (const loc of ["ko", "en"] as const) {
      const seen = LIFE_PERIODS.map((p) => seedQuestion(p, loc));
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it("Coverage 행렬이 여섯 칸을 갖는다", () => {
    const c = emptyCoverage();
    for (const p of LIFE_PERIODS) expect(c[p]).toBeDefined();
  });
});

describe("옛 링크가 죽지 않는다", () => {
  it.each([
    ["childhood", "infancy"],
    ["teens", "school"],
    ["20s", "twenties"],
    ["thirties", "later"],
    ["forties", "later"],
    ["seventies", "later"],
    ["current", "now"],
  ])("%s → %s", (from, to) => {
    expect(parsePeriodParam(from)).toBe(to);
  });

  it("새 이름은 그대로 통과한다", () => {
    for (const p of LIFE_PERIODS) expect(parsePeriodParam(p)).toBe(p);
  });

  it("모르는 값·빈 값은 '지금' 으로 (누구에게나 열린 자리)", () => {
    expect(parsePeriodParam(undefined)).toBe("now");
    expect(parsePeriodParam("")).toBe("now");
    expect(parsePeriodParam("babyhood")).toBe("now");
    expect(parsePeriodParam(["teens", "20s"])).toBe("school");
  });
});
