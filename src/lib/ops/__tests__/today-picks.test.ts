// 오늘의 두 가지 (Simon 2026-08-18, D6).
//
// 이 모듈이 지켜야 하는 약속은 "잘 고른다" 가 아니라 **"없는 것을 있는 것처럼
// 보여주지 않는다"** 다. cowork 대시보드 프롬프트는 "샘플로 채운 항목은 표시하라"
// 였는데, 이 앱에서는 한 걸음 더 가서 샘플을 아예 넣지 않기로 했다(정직한 밝기).
// 그 약속이 코드로 확인되지 않으면 다음 사람이 빈 화면을 보고 "뭐라도 채우자"
// 하게 된다. 그래서 검사의 절반이 부재를 지킨다.
import { PICK_COUNT, PICK_IDS, pickToday, picksAreAllReal, type PickCandidate } from "../today-picks";

const NOW = Date.UTC(2026, 7, 18, 9, 0, 0);
const DAY = 86_400_000;

function cand(id: PickCandidate["id"], over: Partial<PickCandidate> = {}): PickCandidate {
  return { id, hasData: true, ...over };
}

describe("pickToday", () => {
  it("두 개만 고른다", () => {
    const all = PICK_IDS.map((id) => cand(id, { lastActivityAt: NOW - DAY }));
    expect(pickToday(all, NOW).picks).toHaveLength(PICK_COUNT);
  });

  it("오늘 걸린 것이 최근에 손댄 것보다 먼저다", () => {
    // 시간이 걸린 일은 늦으면 의미가 없어진다.
    const out = pickToday(
      [
        cand("records", { lastActivityAt: NOW - 60_000 }),
        cand("routine", { dueToday: true, lastActivityAt: NOW - 30 * DAY }),
      ],
      NOW,
    );
    expect(out.picks[0]).toBe("routine");
  });

  it("오래 손 놓은 것은 뒤로 간다", () => {
    const out = pickToday(
      [
        cand("meals", { lastActivityAt: NOW - 200 * DAY }),
        cand("reading", { lastActivityAt: NOW - 2 * DAY }),
      ],
      NOW,
    );
    expect(out.picks[0]).toBe("reading");
  });

  it("같은 점수면 순서가 고정된다", () => {
    // 열 때마다 자리가 바뀌면 사용자가 위치를 못 외우고, "왜 이게 떴지" 에도
    // 답할 수 없다.
    const a = [cand("reading"), cand("records")];
    const first = pickToday(a, NOW).picks;
    const second = pickToday([...a].reverse(), NOW).picks;
    expect(first).toEqual(second);
  });
});

describe("없는 것을 지어내지 않는다", () => {
  it("데이터가 없는 후보는 고르지 않는다", () => {
    const out = pickToday(
      [cand("routine", { hasData: false, dueToday: true }), cand("reading", { lastActivityAt: NOW })],
      NOW,
    );
    expect(out.picks).toEqual(["reading"]);
  });

  it("아무 데이터도 없으면 아무것도 고르지 않는다", () => {
    // 빈 화면이 가짜 화면보다 낫다. 여기서 데모 카드를 넣기 시작하면 정직한
    // 밝기 규칙이 무너진다.
    const out = pickToday(
      PICK_IDS.map((id) => cand(id, { hasData: false })),
      NOW,
    );
    expect(out.picks).toEqual([]);
  });

  it("빈 자리는 가짜가 아니라 '다음 걸음' 으로 채운다", () => {
    const out = pickToday([cand("reading", { lastActivityAt: NOW })], NOW);
    expect(out.picks).toEqual(["reading"]);
    // 자리가 하나 남았으니 안내가 하나 나온다. 이건 카드가 아니라 권유다.
    expect(out.suggestions).toHaveLength(1);
    // 이미 보여주는 것을 다시 권하지 않는다.
    expect(out.suggestions).not.toContain("reading");
  });

  it("두 자리가 다 찼으면 권유하지 않는다", () => {
    const out = pickToday([cand("reading", { lastActivityAt: NOW }), cand("records", { lastActivityAt: NOW })], NOW);
    expect(out.suggestions).toEqual([]);
  });

  it("권유 순서가 매번 같다", () => {
    // 매번 다른 것을 권하면 권유가 아니라 잡음이다.
    const only = [cand("records", { lastActivityAt: NOW })];
    expect(pickToday(only, NOW).suggestions).toEqual(pickToday(only, NOW + DAY).suggestions);
  });

  it("고른 것이 전부 실제 데이터임을 확인할 수 있다", () => {
    const cands = [cand("reading", { lastActivityAt: NOW }), cand("meals", { hasData: false })];
    const out = pickToday(cands, NOW);
    expect(picksAreAllReal(out, cands)).toBe(true);
  });
});

describe("건강은 후보가 아니다", () => {
  it("health 소스를 후보 목록에 두지 않는다", () => {
    // health_samples 는 PIPA 제23조 민감정보이고 별도 동의(health_import) 뒤에
    // 있다. 비서 홈처럼 항상 열리는 화면이 그 동의를 우회해 건강을 노출하면
    // 그 분리가 무의미해진다. esm(자기보고 컨디션)은 사용자가 이 앱에 직접
    // 입력한 것이라 다르게 취급한다.
    expect(PICK_IDS).not.toContain("health" as never);
  });
});
