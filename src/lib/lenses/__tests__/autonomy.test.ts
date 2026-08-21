// 자율도 사다리 — 오르는 길이 **적중 하나뿐**인지, 되돌림이 즉시 강등하는지.
import {
  INITIAL_AUTONOMY,
  PROMOTE_AFTER,
  mayPrefill,
  nextAutonomy,
  optionCount,
  type AutonomyState,
  type LensOutcome,
} from "../autonomy";

const run = (outcomes: readonly LensOutcome[], from: AutonomyState = INITIAL_AUTONOMY) =>
  outcomes.reduce(nextAutonomy, from);

describe("시작", () => {
  it("L1 에서 시작한다 — 처음에는 매번 묻는다", () => {
    expect(INITIAL_AUTONOMY).toEqual({ level: 1, streak: 0 });
  });
});

describe("오르는 길은 적중뿐", () => {
  it(`연속 ${PROMOTE_AFTER}번 맞히면 한 단계 오른다`, () => {
    expect(run(Array(PROMOTE_AFTER).fill("hit"))).toEqual({ level: 2, streak: 0 });
  });

  it("적중이 끊기면 다시 처음부터 센다", () => {
    // 2번 맞히고 1번 빗나가면 승급이 아니라 streak 0.
    expect(run(["hit", "hit", "miss"])).toEqual({ level: 1, streak: 0 });
    expect(run(["hit", "hit", "miss", "hit", "hit"])).toEqual({ level: 1, streak: 2 });
  });

  it("L3 이 천장이다", () => {
    const s = run(Array(PROMOTE_AFTER * 5).fill("hit"));
    expect(s.level).toBe(3);
  });

  it("사용 횟수로는 오르지 않는다 — miss 만 쌓아도 제자리", () => {
    // 감사에서 걸린 원래 문제가 "행이 들어왔는가 / 몇 번 눌렀는가"로 등급을
    // 매긴 것이었다. 여기서는 호출이 아무리 많아도 적중이 없으면 안 오른다.
    expect(run(Array(50).fill("miss"))).toEqual({ level: 1, streak: 0 });
  });
});

describe("되돌리면 강등", () => {
  it("한 번 되돌리면 즉시 한 단계 내려간다", () => {
    const l2 = run(Array(PROMOTE_AFTER).fill("hit"));
    expect(l2.level).toBe(2);
    expect(nextAutonomy(l2, "reverted")).toEqual({ level: 1, streak: 0 });
  });

  it("되돌림은 쌓아둔 연속 적중도 지운다", () => {
    const almost = run(["hit", "hit"]);
    expect(almost.streak).toBe(2);
    expect(nextAutonomy(almost, "reverted").streak).toBe(0);
  });

  it("L1 아래로는 안 내려간다", () => {
    expect(run(Array(5).fill("reverted"))).toEqual({ level: 1, streak: 0 });
  });

  it("miss 는 강등이 아니다 — 한 번 빗나갔다고 권한을 뺏지 않는다", () => {
    const l2 = run(Array(PROMOTE_AFTER).fill("hit"));
    expect(nextAutonomy(l2, "miss").level).toBe(2);
  });
});

describe("화면이 이 값을 보고 갈라진다", () => {
  it("L3 에서만 기본값을 채운다", () => {
    expect(mayPrefill(1)).toBe(false);
    expect(mayPrefill(2)).toBe(false);
    expect(mayPrefill(3)).toBe(true);
  });

  it("선택지 개수: L1 0개 · L2 2개 · L3 1개(기본값)", () => {
    expect(optionCount(1)).toBe(0);
    expect(optionCount(2)).toBe(2);
    expect(optionCount(3)).toBe(1);
  });
});
