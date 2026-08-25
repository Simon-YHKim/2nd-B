// 홈 말풍선이 모든 별에 대해 사람이 읽을 문장을 갖는가.
//
// 2026-08-26 실측 사고: 홈 별 id 는 #1376 에서 새 일곱(profile·infancy·school·
// twenties·later·work·now)으로 바뀌었는데 말풍선 카피 키 `ds.home.star.<id>.line`
// 은 옛 도메인 id(career·finance·relation·growth·health·recreation)로만 남아
// 있었다. i18next 는 없는 키를 예외 없이 **키 문자열 그대로** 돌려주므로, 화면은
// 죽지 않고 "ds.home.star.infancy.line" 을 말풍선에 띄웠다 — 일곱 중 여섯이.
//
// 타입도 테스트도 이걸 못 잡은 이유는 키가 데이터(JSON)에 있고 id 는 코드에
// 있어서다. 그 사이를 여기서 잇는다. 새 별을 추가하면 이 검사가 먼저 빨개진다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEVEN_STARS } from "../seven-stars";

const ROOT = join(__dirname, "..", "..", "..", "..");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

function homeDict(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, "locales", locale, "home.json"), "utf8"));
}

describe("홈 말풍선 카피가 일곱 별 전부를 덮는다", () => {
  for (const locale of LOCALES) {
    it(`${locale}: 모든 별에 ds.home.star.<id>.line 이 있다`, () => {
      const dict = homeDict(locale) as {
        ds: { home: { star: Record<string, { line?: string } | undefined> } };
      };
      const star = dict.ds.home.star;
      const missing = SEVEN_STARS.map((s) => s.id).filter(
        (id) => typeof star[id]?.line !== "string" || star[id]!.line!.trim().length === 0,
      );
      expect(missing).toEqual([]);
    });
  }

  it("별 id 목록이 곧 새 일곱이다 (옛 도메인 id 를 별로 되돌리지 말 것)", () => {
    const ids = SEVEN_STARS.map((s) => s.id);
    expect(ids).toHaveLength(7);
    expect(ids).toContain("infancy");
    expect(ids).not.toContain("career");
  });
});
