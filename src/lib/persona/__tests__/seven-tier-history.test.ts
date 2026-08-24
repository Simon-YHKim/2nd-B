// 원장에서 **두 체계가 섞이지 않는다.**
//
// 여기가 이 단계에서 가장 조용히 틀릴 수 있는 자리다. `star_tier_history.star_id`
// 는 제약 없는 text 이고, 옛 자기이해 축의 `now`(지금의 나 = 특성 상태)와 새
// 별의 `now`(지금 = 현재의 나를 알아가는 자리)는 **글자가 같고 뜻이 다르다.**
//
// 섞이면 예외도 안 나고 화면도 안 죽는다. 그냥 틀린 숫자가 뜬다 -- 옛 축의
// 등급이 새 별을 밝히고, 8주 그래프가 두 체계를 한 줄에 겹쳐 그린다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SEVEN_STARS, SEVEN_STAR_IDS } from "../seven-stars";
import { SELF_UNDERSTANDING_STARS } from "../stars";
import { SEVEN_TIER_PREFIX, parseTierKey, tierKey } from "../seven-tier-history";
import { isSevenTierKey, resolveStarName } from "../star-name";

describe("⚠ 두 체계에 같은 글자의 id 가 실제로 있다", () => {
  it("`now` 가 양쪽에 다 있다 (이 검사가 실패하면 접두사가 필요 없어진 것이다)", () => {
    // 이 사실이 접두사의 존재 이유 전부다. 사라지면 주석부터 고쳐야 한다.
    expect(SEVEN_STAR_IDS).toContain("now");
    expect(SELF_UNDERSTANDING_STARS.map((s) => s.id)).toContain("now");
  });
});

describe("원장 키", () => {
  it("모든 새 별이 접두사를 단다", () => {
    for (const s of SEVEN_STARS) expect(tierKey(s.id)).toBe(`${SEVEN_TIER_PREFIX}${s.id}`);
  });

  it("왕복한다", () => {
    for (const s of SEVEN_STARS) expect(parseTierKey(tierKey(s.id))).toBe(s.id);
  });

  it("⚠ 옛 축의 id 는 절대 새 별로 읽히지 않는다", () => {
    for (const old of SELF_UNDERSTANDING_STARS) {
      expect(parseTierKey(old.id)).toBeNull();
      expect(isSevenTierKey(old.id)).toBe(false);
    }
  });

  it("접두사만 붙은 모르는 이름은 받지 않는다", () => {
    expect(parseTierKey(`${SEVEN_TIER_PREFIX}nope`)).toBeNull();
    expect(parseTierKey("")).toBeNull();
    expect(parseTierKey("seven")).toBeNull();
  });
});

describe("이름은 한 곳에서 붙는다", () => {
  it("새 별은 홈과 같은 키로 이름을 받는다", () => {
    const name = resolveStarName(tierKey("school"), "ko", (key) => `이름:${key}`);
    expect(name).toBe("이름:school");
  });

  it("옛 축은 옛 이름을 그대로 유지한다 (원장에 아직 945건 있다)", () => {
    expect(resolveStarName("now", "ko")).toBe("지금의 나");
    expect(resolveStarName("now", "en")).toBe("Trait state");
  });

  it("⚠ 같은 글자라도 접두사에 따라 다른 이름이 나온다", () => {
    const oldName = resolveStarName("now", "ko");
    const newName = resolveStarName(tierKey("now"), "ko", (key) => `이름:${key}`);
    expect(newName).not.toBe(oldName);
  });

  it("모르는 id 는 지어내지 않고 그대로 보여준다", () => {
    expect(resolveStarName("mystery", "ko")).toBe("mystery");
  });
});

describe("쓰는 쪽이 접두사를 우회하지 않는다", () => {
  const src = readFileSync(join(__dirname, "..", "seven-tier-history.ts"), "utf8");

  it("insert 가 tierKey 를 통과한다", () => {
    // `star_id: id` 로 직접 쓰면 접두사가 빠져 옛 축과 같은 칸에 들어간다.
    expect(src).toContain("star_id: tierKey(id)");
    expect(src).not.toMatch(/star_id:\s*id\b/);
  });

  it("읽는 쪽도 parseTierKey 를 통과한다", () => {
    expect(src).toContain("parseTierKey(r.star_id)");
  });
});

describe("8주 화면이 옛 행을 안 그린다", () => {
  const screen = readFileSync(
    join(__dirname, "..", "..", "..", "app", "brightness.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("읽자마자 거른다", () => {
    expect(screen).toContain("rows.filter((r) => isSevenTierKey(r.star_id))");
  });

  it("이름을 홈 키에서 읽는다", () => {
    expect(screen).toContain("tHome(`ds.star.${key}`)");
  });
});
