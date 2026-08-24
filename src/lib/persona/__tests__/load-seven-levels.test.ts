// 밝기가 **판 만큼만** 밝다.
//
// 이 저장소가 감사에서 걸렸던 것이 정확히 이 지점이다 -- 일곱 별 중 다섯의
// 등급이 구인이 아니라 "행이 들어왔는가 / 몇 번 눌렀는가"를 쟀다. 그래서 밝기가
// 사용자에게 아무것도 알려주지 않았다.
//
// 이제는 셀 수 있는 것을 센다: 그 자리에서 다섯 층 중 몇 층을 열었는가.
// 여기 있는 검사들은 그 약속이 조용히 깨지지 않게 한다.
import { levelFromCells } from "../load-seven-levels";
import { DRILL_LAYERS } from "../../interview/probe";

describe("판 칸 수 -> 등급", () => {
  it("아무것도 안 팠으면 L1 -- 어두운 것은 거짓말이 아니다", () => {
    expect(levelFromCells(0)).toBe(1);
  });

  it("한 층만 열려도 켜진다 (L2)", () => {
    expect(levelFromCells(1)).toBe(2);
  });

  it("팔수록 오른다", () => {
    const seen = [0, 1, 2, 3, 4, 5].map(levelFromCells);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it("⚠ 다 파도 L4 에서 멈춘다 -- L5 는 비준으로만 온다", () => {
    // 이 저장소의 규율이다(propose->ratify). 자동으로 최고 등급이 나오면
    // "네가 확인해줬다"와 "내가 계산했다"가 구분되지 않는다.
    for (const cells of [4, 5, 9, 100]) expect(levelFromCells(cells)).toBe(4);
  });

  it("층 수보다 큰 값이 들어와도 등급이 넘치지 않는다", () => {
    expect(levelFromCells(DRILL_LAYERS.length + 10)).toBeLessThanOrEqual(4);
  });
});
