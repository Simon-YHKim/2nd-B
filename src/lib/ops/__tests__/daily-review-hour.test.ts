// "오늘의 정리" 알림 시각 (Simon 결정 B3, 2026-08-20).
//
// 이 기능이 필요했던 이유는 함수가 못 해서가 아니라 **화면이 안 물어봐서**다.
// `scheduleDailyReview` 는 처음부터 임의 시각을 받고 0-23 / 0-59 검증까지 했는데
// `digest.tsx` 가 `scheduleDailyReview(9, 0, ...)` 로 09:00 을 박아 넘겼다.
//
// 그래서 이 파일이 지키는 것은 두 가지다:
//   1. 시각 저장·정규화가 옳게 동작한다
//   2. **화면이 다시 시각을 하드코딩하지 않는다** ← 재발 방지의 본체
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DAILY_REVIEW_HOURS,
  DEFAULT_DAILY_REVIEW_HOUR,
  formatDailyReviewHour,
} from "../daily-review";

describe("알림 시각 선택지", () => {
  it("기본값이 선택지 안에 있다", () => {
    // 기본값이 목록 밖이면 화면에 아무것도 선택되지 않은 채로 뜬다.
    expect(DAILY_REVIEW_HOURS).toContain(DEFAULT_DAILY_REVIEW_HOUR);
  });

  it("선택지가 전부 유효한 시각이고 중복이 없다", () => {
    for (const h of DAILY_REVIEW_HOURS) {
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(23);
    }
    expect(new Set(DAILY_REVIEW_HOURS).size).toBe(DAILY_REVIEW_HOURS.length);
  });

  it("선택지가 오름차순이다", () => {
    // 화면이 이 배열 순서대로 칩을 그린다. 뒤섞이면 고르기 어려워진다.
    expect([...DAILY_REVIEW_HOURS]).toEqual([...DAILY_REVIEW_HOURS].sort((a, b) => a - b));
  });

  it("24시간 표기로 두 자리를 맞춘다", () => {
    // 로케일 분기가 필요 없는 표기를 고른 이유: 오전/오후 표현은 언어마다 갈리고,
    // 그걸 로케일 문자열로 빼면 5개 로케일에 시각 포맷이 흩어진다.
    expect(formatDailyReviewHour(7)).toBe("07:00");
    expect(formatDailyReviewHour(9)).toBe("09:00");
    expect(formatDailyReviewHour(18)).toBe("18:00");
    expect(formatDailyReviewHour(22)).toBe("22:00");
  });
});

describe("화면이 시각을 다시 하드코딩하지 않는다", () => {
  const digest = readFileSync(join(process.cwd(), "src", "app", "digest.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("scheduleDailyReview 에 리터럴 시각을 넘기지 않는다", () => {
    // 이게 원래의 결함이다: `scheduleDailyReview(9, 0, ...)`.
    // 첫 인자가 숫자 리터럴이면 사용자의 선택이 무시된 것이다.
    const literalHour = /scheduleDailyReview\(\s*\d/.test(digest);
    expect({ hardcodedHour: literalHour }).toEqual({ hardcodedHour: false });
  });

  it("저장된 시각을 읽어서 넘긴다", () => {
    expect(digest).toContain("loadDailyReviewHour");
    expect(digest).toContain("setDailyReviewHourPref");
    expect(digest).toContain("scheduleDailyReview(hour, 0");
  });

  it("시각 라벨이 로케일 문자열에서 오고, 값은 보간된다", () => {
    // 문구를 화면에 박으면 다른 언어에서 "매일 09:00 에 알림" 이 한국어로 남는다.
    expect(digest).toContain("digest.reminder.timeTitle");
    const ko = JSON.parse(
      readFileSync(join(process.cwd(), "locales", "ko", "ratifications.json"), "utf8"),
    ) as { digest: { reminder: Record<string, string> } };
    expect(ko.digest.reminder.label).toContain("{{time}}");
  });
});
