// 저장한 조각을 "그 조각이 담긴 영역 화면"에서 보여주는 길 (P1 · Simon 결정 2026-09-13 22:26).
//
// 태그 -> 이동 경로 해석을 순수 함수로 잰다. 화면 셋(/capture · 배송 기록 상세 ·
// /star/[domain])이 이 함수를 실제로 쓰는지는 src/app/__tests__/saved-piece-opens-its-area.test.ts
// 가 소스로 잰다 - 컴포넌트 렌더 테스트는 이 저장소에서 막혀 있다(RN 0.85 upstream).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOMAIN_STARS, domainTagFor, isDomainId } from "../../persona/domain-stars";
import { domainScreenRoute, lifeDomainOf } from "../domain-screen";
import { recordDomain } from "../records-graph";

const SOURCE_PIECE = "src-2b1f6c1e-8a55-4c1e-9f0e-6f1d2a3b4c5d";

describe("lifeDomainOf - 조각이 담긴 생활 영역", () => {
  test("생활 영역 태그가 있으면 그 영역이다", () => {
    expect(lifeDomainOf(["domain:career", "goals"])).toBe("career");
  });

  test("collect 는 생활 영역이 아니다", () => {
    // 담아내기는 데이터가 흘러드는 통로다(DomainDashboard 의 LIFE_DOMAINS 가 뺀다).
    expect(lifeDomainOf([domainTagFor("collect")])).toBeNull();
  });

  test("태그가 없으면 영역이 없다", () => {
    expect(lifeDomainOf([])).toBeNull();
    expect(lifeDomainOf(null)).toBeNull();
    expect(lifeDomainOf(undefined)).toBeNull();
    expect(lifeDomainOf(["goals", "reading"])).toBeNull();
  });

  test("알 수 없는 슬러그는 영역으로 치지 않는다", () => {
    expect(lifeDomainOf(["domain:banana"])).toBeNull();
    // 건너뛰고 다음 유효한 태그를 쓴다 - recordDomain 과 같다.
    expect(lifeDomainOf(["domain:banana", "domain:health"])).toBe("health");
  });

  test("해석이 recordDomain 과 같다", () => {
    const cases: (readonly string[] | null)[] = [
      null,
      [],
      ["goals"],
      ["domain:finance"],
      // 대소문자를 가린다. /star/[domain] 목록도 domain:<id> 를 정확히 맞춰 읽는다.
      ["Domain:Finance"],
      ["domain:"],
      ["domain:collect", "domain:growth"],
      ["domain:growth", "domain:collect"],
      ["domain:relation", "domain:rest"],
    ];
    for (const tags of cases) {
      const domain = recordDomain(tags);
      expect({ tags, area: lifeDomainOf(tags) }).toEqual({
        tags,
        area: domain === "collect" ? null : domain,
      });
    }
  });
});

describe("domainScreenRoute - 영역 화면으로 가는 경로", () => {
  test("영역 화면을 열고, 보여줄 조각을 함께 보낸다", () => {
    expect(domainScreenRoute("career", SOURCE_PIECE)).toEqual({
      pathname: "/star/[domain]",
      params: { domain: "career", pieceId: SOURCE_PIECE },
    });
  });

  test("보내는 영역은 전부 /star/[domain] 이 받는 값이다", () => {
    const screen = readFileSync(
      join(__dirname, "..", "..", "..", "app", "star", "[domain].tsx"),
      "utf8",
    );
    // 받는 쪽의 판정 줄. 이 줄이 바뀌면 아래 집합 비교의 전제도 바뀐다 - 같이 다시 잰다.
    expect(screen).toContain('const valid = typeof domain === "string" && isDomainId(domain);');
    // 웹 정적 페이지는 slug 로 만든다. 보내는 값도 slug 여야 직접 주소로 들어와도 404 가 아니다.
    expect(screen).toContain("DOMAIN_STARS.map((d) => ({ domain: d.slug }))");

    const sent = DOMAIN_STARS.map((star) => ({ star, area: lifeDomainOf([domainTagFor(star.id)]) }));
    for (const { star, area } of sent) {
      if (star.id === "collect") {
        expect(area).toBeNull();
        continue;
      }
      expect(area).not.toBeNull();
      expect(isDomainId(area!)).toBe(true);
      expect(domainScreenRoute(area!, SOURCE_PIECE).params.domain).toBe(star.slug);
    }
    // 여섯 영역이 전부 갈 곳을 갖는다 - 0건 통과를 막는다.
    expect(sent.filter(({ area }) => area !== null)).toHaveLength(6);
  });
});
