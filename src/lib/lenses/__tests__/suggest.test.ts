// 자율도가 실제로 화면 모양을 가르는가, 그리고 되돌림/빗나감의 경계가 한 군데
// 있는가. 이 두 가지가 흐려지면 사다리는 렌즈마다 다르게 돈다.
import { nextAutonomy, type Autonomy } from "../autonomy";
import { hasValue, outcomeOf, suggest } from "../suggest";

const LEVELS: readonly Autonomy[] = [1, 2, 3];

describe("자율도가 모양을 가른다", () => {
  it("L1 은 값을 안 들고 온다 — 후보가 아무리 많아도", () => {
    expect(suggest(1, ["a", "b", "c"])).toEqual({ kind: "ask" });
  });

  it("L2 는 둘로 좁혀 온다", () => {
    expect(suggest(2, ["a", "b", "c"])).toEqual({ kind: "choose", options: ["a", "b"] });
  });

  it("L3 은 하나를 채워 온다", () => {
    expect(suggest(3, ["a", "b", "c"])).toEqual({ kind: "prefill", value: "a" });
  });

  it("들어온 순서를 존중한다 — 무엇이 좋은 후보인지는 렌즈가 정한다", () => {
    expect(suggest(3, ["z", "a"])).toEqual({ kind: "prefill", value: "z" });
  });
});

describe("후보가 모자라면 아래로 떨어진다", () => {
  it.each(LEVELS)("L%d 도 후보가 없으면 묻는다", (level) => {
    expect(suggest(level, [])).toEqual({ kind: "ask" });
  });

  it("L2 인데 후보가 하나면 묻는다 (같은 값을 두 번 내밀지 않는다)", () => {
    expect(suggest(2, ["only"])).toEqual({ kind: "ask" });
  });

  it("L3 은 후보가 하나여도 채운다 — 하나면 충분하다", () => {
    expect(suggest(3, ["only"])).toEqual({ kind: "prefill", value: "only" });
  });

  it("이건 실패가 아니라 정상 경로다 (새 사용자는 후보가 없다)", () => {
    // 떨어졌다고 해서 자율도가 내려가지는 않는다. 예측을 안 한 것이지 틀린 게 아니다.
    const s = suggest(3, [] as string[]);
    expect(outcomeOf(s, "anything")).toBe("no-prediction");
  });
});

describe("hasValue", () => {
  it("ask 만 값이 없다", () => {
    expect(hasValue(suggest(1, ["a", "b"]))).toBe(false);
    expect(hasValue(suggest(2, ["a", "b"]))).toBe(true);
    expect(hasValue(suggest(3, ["a", "b"]))).toBe(true);
  });
});

describe("되돌림과 빗나감의 경계는 여기 하나뿐이다", () => {
  it("채워온 값을 그대로 두면 적중", () => {
    expect(outcomeOf(suggest(3, ["a", "b"]), "a")).toBe("hit");
  });

  it("채워온 값을 고치면 **되돌림** — 세컨비가 정하지 말라는 뜻", () => {
    expect(outcomeOf(suggest(3, ["a", "b"]), "z")).toBe("reverted");
  });

  it("낸 둘 중에서 고르면 적중", () => {
    expect(outcomeOf(suggest(2, ["a", "b"]), "b")).toBe("hit");
  });

  it("둘 다 아닌 값을 넣으면 **빗나감** — 좁힌 게 틀렸을 뿐 권한 문제는 아니다", () => {
    expect(outcomeOf(suggest(2, ["a", "b"]), "z")).toBe("miss");
  });

  it("묻기만 했으면 예측이 없었으므로 채점하지 않는다", () => {
    expect(outcomeOf(suggest(1, ["a", "b"]), "a")).toBe("no-prediction");
  });

  it("비교 방식을 갈아끼울 수 있다 (객체 필드를 비교해야 하는 렌즈용)", () => {
    const s = suggest(3, [{ id: "a" }, { id: "b" }]);
    expect(outcomeOf(s, { id: "a" })).toBe("reverted"); // 기본 Object.is 는 참조 비교
    expect(outcomeOf(s, { id: "a" }, (x, y) => x.id === y.id)).toBe("hit");
  });
});

describe("사다리와 이어 붙였을 때", () => {
  // 이 테스트가 이 파일의 요점이다: 제안 -> 응답 -> 자율도가 한 바퀴 돈다.
  const ride = (start: Autonomy, answers: readonly string[], candidates: readonly string[]) => {
    let state = { level: start, streak: 0 };
    for (const answer of answers) {
      const s = suggest(state.level, candidates);
      const outcome = outcomeOf(s, answer);
      if (outcome === "no-prediction") continue;
      state = nextAutonomy(state, outcome);
    }
    return state;
  };

  it("L1 에서는 아무리 맞춰도 안 오른다 — 예측을 안 하니까 채점할 것이 없다", () => {
    // 사다리를 올리려면 **먼저 예측을 해야** 한다. L1 은 묻기만 하므로
    // no-prediction 만 쌓이고 streak 이 안 생긴다. 이게 의도된 동작이다:
    // 첫 승급은 사용자가 L2 를 켜주는 데서 시작한다.
    expect(ride(1, ["a", "a", "a", "a", "a"], ["a", "b"])).toEqual({ level: 1, streak: 0 });
  });

  it("L2 에서 세 번 맞히면 L3 으로 오른다", () => {
    expect(ride(2, ["a", "a", "a"], ["a", "b"])).toEqual({ level: 3, streak: 0 });
  });

  it("L3 에서 한 번 고치면 바로 L2 로 내려온다", () => {
    expect(ride(3, ["z"], ["a", "b"])).toEqual({ level: 2, streak: 0 });
  });

  it("L2 에서 빗나가도 L1 으로는 안 내려간다", () => {
    expect(ride(2, ["z", "z", "z"], ["a", "b"])).toEqual({ level: 2, streak: 0 });
  });
});
