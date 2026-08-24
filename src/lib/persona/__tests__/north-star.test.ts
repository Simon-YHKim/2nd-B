import { canonPolarisBrightness } from "@/lib/canon";

import { HEADLINE_STAR_IDS, domainStarLevels, northStarBrightness } from "../north-star";
import type { DomainEntry, DomainId } from "../domain-stars";

const organized = (n: number): DomainEntry[] =>
  Array.from({ length: n }, () => ({ domain: "career" as const, category: "c", tags: ["t"] }));

describe("domainStarLevels", () => {
  it("defaults every domain with no entries to L1 (honest dark star)", () => {
    const levels = domainStarLevels({});
    expect(Object.values(levels)).toHaveLength(7);
    expect(Object.values(levels).every((l) => l === 1)).toBe(true);
  });

  it("derives each domain's level from its own entries", () => {
    const levels = domainStarLevels({
      career: organized(15), // -> L4
      finance: organized(5), // -> L3
      relation: organized(1), // -> L2
    });
    expect(levels.career).toBe(4);
    expect(levels.finance).toBe(3);
    expect(levels.relation).toBe(2);
    expect(levels.health).toBe(1); // untouched domain stays dark
  });

  it("threads per-domain ratify through to L5 (propose->ratify)", () => {
    const levels = domainStarLevels({ growth: organized(1) }, { growth: { ratified: true } });
    expect(levels.growth).toBe(5);
  });

  describe("recency threading (§4.5 ④, opt-in via now)", () => {
    const NOW = Date.parse("2026-06-26T00:00:00Z");
    const datedOrganized = (n: number, isoDate: string): DomainEntry[] =>
      Array.from({ length: n }, () => ({
        domain: "career" as const,
        category: "c",
        tags: ["t"],
        createdAt: isoDate,
      }));

    it("no now → recency never applies (back-compat: stale domain keeps its band)", () => {
      const levels = domainStarLevels({ career: datedOrganized(15, "2020-01-01T00:00:00Z") });
      expect(levels.career).toBe(4); // high → L4, undimmed
    });

    it("now dims a domain whose newest entry is older than 60 days", () => {
      const levels = domainStarLevels(
        { career: datedOrganized(15, "2026-01-01T00:00:00Z") }, // ~177 days old
        {},
        NOW,
      );
      expect(levels.career).toBe(3); // high → medium → L3
    });

    it("a fresh domain stays bright while a stale one dims under the same now", () => {
      const levels = domainStarLevels(
        {
          career: datedOrganized(15, "2026-06-20T00:00:00Z"), // 6 days old → bright
          finance: datedOrganized(15, "2026-01-01T00:00:00Z"), // stale → dims
        },
        {},
        NOW,
      );
      expect(levels.career).toBe(4);
      expect(levels.finance).toBe(3);
    });
  });
});

describe("northStarBrightness — 홈이 그리는 여섯 별의 평균", () => {
  // ⚠ 2026-08-24: 구성원이 통째로 바뀌었다. 예전에는 여섯 생활 도메인이었고
  // `collect` 가 몰래 평균에 끼는 것이 이 파일이 막던 결함이었다. 도메인이
  // 별자리에서 내려가면서 그 자리에 **나를 알아가는 여섯**이 들어왔다.
  //
  // 규칙은 그대로다: **그리는 것만 평균한다.** 그래서 지켜야 할 불변식도 그대로고,
  // 이름만 바뀌었다 -- 이제 "끼면 안 되는 것"은 `collect` 가 아니라 `profile` 이다.
  const SIX = HEADLINE_STAR_IDS;
  const at = (level: 1 | 2 | 3 | 4 | 5) =>
    Object.fromEntries(SIX.map((id) => [id, level])) as Record<(typeof SIX)[number], typeof level>;

  it("전부 어두우면 0.2 (L1/5)", () => {
    expect(northStarBrightness({})).toBeCloseTo(0.2, 6);
    expect(northStarBrightness(at(1))).toBeCloseTo(0.2, 6);
  });

  it("전부 L5 면 1 을 넘지 않는다", () => {
    expect(northStarBrightness(at(5))).toBe(1);
  });

  it("넓게 켜진 쪽이 하나만 깊은 쪽을 이긴다 (전부 켜져야 보너스)", () => {
    const oneSpike = northStarBrightness({ [SIX[0]]: 4 });
    expect(northStarBrightness(at(2))).toBeGreaterThan(oneSpike);
  });

  it("한 별이라도 어두우면 보너스가 안 붙는다", () => {
    const allLit = northStarBrightness(at(2));
    const oneDark = northStarBrightness({ ...at(2), [SIX[0]]: 1 });
    expect(allLit - oneDark).toBeGreaterThan(canonPolarisBrightness.allLitBonus / 2);
  });
});

describe("평균에 들어가는 목록은 캐논이 정한다", () => {
  it("하드코딩하지 않고 캐논에서 읽는다", () => {
    expect([...HEADLINE_STAR_IDS]).toEqual(canonPolarisBrightness.includedDomainIds);
  });

  it("⚠ 프로필은 평균에 안 들어간다", () => {
    // 나를 **설명하는** 자리이지 **증거**가 아니다. 넣으면 페르소나가 부분적으로
    // 자기 자신의 평균이 된다.
    expect(HEADLINE_STAR_IDS).not.toContain("profile");
    expect(canonPolarisBrightness.excludedHomeNodeIds).toContain("profile");
  });

  it("⚠ 평균 밖의 값은 숫자를 못 움직인다 (이 파일이 원래 막던 결함)", () => {
    const visible = Object.fromEntries(HEADLINE_STAR_IDS.map((id) => [id, 3 as const]));
    const base = northStarBrightness(visible);
    for (const level of [1, 2, 3, 4, 5] as const) {
      // profile 은 타입상 들어갈 수 없지만, 런타임에 섞여 들어와도 무시돼야 한다.
      expect(northStarBrightness({ ...visible, profile: level } as never)).toBe(base);
    }
  });

  it("생활 도메인은 이제 평균에 없다", () => {
    for (const gone of ["career", "finance", "growth", "relation", "health", "recreation", "collect"]) {
      expect(HEADLINE_STAR_IDS as readonly string[]).not.toContain(gone);
    }
  });

  it("캐논 goldens 가 실제 계산과 맞는다", () => {
    for (const g of canonPolarisBrightness.goldens) {
      const levels = Object.fromEntries(
        HEADLINE_STAR_IDS.map((id) => [id, (g.levels as Record<string, number>)[id]]),
      );
      expect(northStarBrightness(levels as never)).toBeCloseTo(g.expected, 6);
    }
  });
});
