// 시기 목록이 **나이에서** 나오는지. 고정 목록으로 되돌아가면 여기서 깨진다.
import { periodsForAge, periodIdsForAge, parsePeriodParam, OLDEST_BAND_CEILING } from "../periods";
import { LIFE_PERIODS, PERIOD_LABEL, seedQuestion, emptyCoverage } from "../probe";

describe("살아온 시기만 만든다", () => {
  test("마지막은 언제나 '지금'", () => {
    for (const age of [14, 19, 20, 25, 33, 46, 59, 71, 90]) {
      const ids = periodIdsForAge(age);
      expect(ids[ids.length - 1]).toBe("current");
    }
  });

  test("아직 살지 않은 시기는 안 만든다", () => {
    expect(periodIdsForAge(25)).toEqual(["childhood", "teens", "twenties", "current"]);
    expect(periodIdsForAge(19)).toEqual(["childhood", "teens", "current"]);
    expect(periodIdsForAge(46)).toEqual([
      "childhood", "teens", "twenties", "thirties", "forties", "current",
    ]);
  });

  test("지나는 중인 시기는 오늘 나이까지 잘린다 (Simon 미리보기 그대로)", () => {
    const at25 = periodsForAge(25);
    expect(at25.find((s) => s.id === "twenties")).toEqual({ id: "twenties", from: 20, to: 25 });
    const at46 = periodsForAge(46);
    // 지나온 시기는 안 잘린다
    expect(at46.find((s) => s.id === "thirties")).toEqual({ id: "thirties", from: 30, to: 39 });
    // 지나는 중인 시기만 잘린다
    expect(at46.find((s) => s.id === "forties")).toEqual({ id: "forties", from: 40, to: 46 });
  });

  test("나이를 모르면 누구나 지나온 둘 + 지금 으로만 떨어진다", () => {
    // 살지 않은 시기를 물어보는 쪽이, 지나온 시기를 빼먹는 쪽보다 나쁘다.
    expect(periodIdsForAge(null)).toEqual(["childhood", "teens", "current"]);
    expect(periodIdsForAge(Number.NaN)).toEqual(["childhood", "teens", "current"]);
    expect(periodIdsForAge(-3)).toEqual(["childhood", "teens", "current"]);
  });

  test("가장 나이 든 칸을 넘어가면 새 칸을 만들지 않고 '지금'이 받는다", () => {
    const at90 = periodIdsForAge(90);
    expect(at90).toContain("seventies");
    expect(at90[at90.length - 1]).toBe("current");
    // 80대 칸은 없다 — union 을 무한히 늘리지 않는 것이 의도다
    expect(new Set(at90).size).toBe(at90.length);
    expect(periodsForAge(OLDEST_BAND_CEILING + 5).some((s) => s.from !== null && s.from >= 80)).toBe(false);
  });

  test("중복이 없고 순서가 나이순이다", () => {
    const slots = periodsForAge(46).filter((s) => s.from !== null);
    const froms = slots.map((s) => s.from as number);
    expect([...froms].sort((a, b) => a - b)).toEqual(froms);
    expect(new Set(froms).size).toBe(froms.length);
  });
});

describe("만들어진 시기는 엔진이 전부 감당한다", () => {
  // 이게 이 파일의 진짜 계약이다. 시기를 늘려놓고 라벨이나 씨앗 질문을 빠뜨리면
  // 화면에 undefined 가 나간다.
  const ALL = new Set<string>();
  for (const age of [14, 25, 35, 46, 55, 65, 75, 90, null]) {
    for (const id of periodIdsForAge(age)) ALL.add(id);
  }

  test("전부 LIFE_PERIODS 안에 있다", () => {
    for (const id of ALL) expect(LIFE_PERIODS).toContain(id);
  });

  test("ko·en 라벨이 다 있다", () => {
    for (const id of ALL) {
      for (const loc of ["ko", "en"] as const) {
        const label = PERIOD_LABEL[loc][id as keyof (typeof PERIOD_LABEL)["ko"]];
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });

  test("ko·en 씨앗 질문이 다 있고, 전부 질문이다", () => {
    for (const id of ALL) {
      for (const loc of ["ko", "en"] as const) {
        const q = seedQuestion(id as never, loc);
        expect(typeof q).toBe("string");
        // 물음표가 있으면 된다. 끝글자로 보지 않는 이유는 기존 current(en) 가
        // 따옴표 안에 질문을 넣어 `?'` 로 끝나기 때문이다 -- 결함이 아니다.
        expect(q).toContain("?");
        expect(q.length).toBeGreaterThan(15);
      }
    }
  });

  test("씨앗 질문이 시기마다 서로 다르다 (돌려쓰지 않았다)", () => {
    for (const loc of ["ko", "en"] as const) {
      const seen = LIFE_PERIODS.map((p) => seedQuestion(p, loc));
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  test("Coverage 행렬이 모든 시기 칸을 갖는다", () => {
    const c = emptyCoverage();
    for (const id of ALL) expect(c[id as keyof typeof c]).toBeDefined();
  });
});

describe("라우트 파라미터 해석", () => {
  test("옛 링크 ?period=20s 가 계속 산다", () => {
    // 기록·북마크에 남아 있는 주소다. 깨뜨리지 말 것.
    expect(parsePeriodParam("20s")).toBe("twenties");
    expect(parsePeriodParam("teens")).toBe("teens");
  });

  test("새 시기가 전부 통과한다", () => {
    for (const p of LIFE_PERIODS) expect(parsePeriodParam(p)).toBe(p);
  });

  test("모르는 값·빈 값은 조용히 '지금'", () => {
    expect(parsePeriodParam(undefined)).toBe("current");
    expect(parsePeriodParam("")).toBe("current");
    expect(parsePeriodParam("babyhood")).toBe("current");
    expect(parsePeriodParam(["teens", "20s"])).toBe("teens");
  });
});
