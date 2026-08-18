// 사용자에게 보이지 않는 라우트의 정본 목록 (Simon 2026-08-18, D1).
//
// ## 왜 이 파일이 있는가
//
// `src/app` 아래 파일은 expo-router 가 **전부 라우트로 자동 등록**한다. 그래서
// 프리뷰·클론·개발 보조 화면도 직접 URL 이면 열린다. 그걸 막는 장치가
// `DevOnlyRoute` 이고, 프로덕션에서는 조용히 `/` 로 리다이렉트한다.
//
// 문제는 그 사실이 **라우트 목록만 봐서는 안 보인다**는 것이었다. 세션마다
// 라우트를 세다가 "화면이 95개나 되네" 로 읽고, 그중 어느 것이 실제 제품이고
// 어느 것이 개발 보조인지 다시 판단해야 했다. 2026-08-18 에 실제로 그 혼선이
// 났다(레거시로 분류한 것 중 하나는 살아 있는 심리검사였고, 지우자고 한 것들은
// 이미 게이트 뒤에 있었다).
//
// 그래서 목록을 **코드로 고정**한다. 문서는 낡지만 이 테스트는 낡으면 깨진다.
//
// ## 규칙
//
// - 개발 보조 화면을 새로 만들면 `DevOnlyRoute` 로 감싸고 아래 목록에 추가한다.
// - 목록에서 빼려면 그 화면이 **사용자용 제품**이 됐다는 뜻이다. 의도한 변경이면
//   목록을 고치면 되고, 의도하지 않았다면 이 테스트가 먼저 알려준다.
// - **지우는 것과 감추는 것은 다르다.** 여기 있는 화면들은 지운 것이 아니라
//   프로덕션에서 안 보이는 것이다. 캐논이 깨졌는지 앱 안에서 보는 것 같은
//   개발 중의 쓸모는 남아 있다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..");

/**
 * 프로덕션에서 사용자에게 보이지 않는 라우트. 전부 `DevOnlyRoute` 뒤에 있다.
 *
 * `trends` 가 여기 있는 것이 의외로 중요하다: `brightness`(밝기 변화)와 겹쳐
 * 보이지만 **사용자 화면에서는 겹치지 않는다.** trends 는 실데이터 서피스가
 * 생길 때까지의 클론 참조물이다.
 */
const DEV_ONLY_ROUTES = [
  "canon",
  "deepspace-flowmap",
  "deepspace-home",
  "deepspace-hub",
  "deepspace-preview",
  "dev-screens",
  "graph",
  "trends",
  "trinity",
] as const;

function routeFiles(): string[] {
  return readdirSync(APP)
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("+") && f !== "_layout.tsx")
    .map((f) => f.replace(/\.tsx$/, ""));
}

describe("개발 전용 라우트", () => {
  // 게이트의 형태는 두 가지다. 대부분은 <DevOnlyRoute> 로 감싸 `/` 로 보내고,
  // trinity 만 인라인으로 같은 __DEV__ 판정을 해서 `/core-brain` 으로 보낸다
  // (레거시를 대체한 화면이 홈이 아니라 북극성이기 때문이다). 검사는 컴포넌트
  // 이름이 아니라 **프로덕션에서 감춰지는가**를 본다 - 이름만 보면 주석에서
  // 언급만 해도 통과해 버린다.
  function isProductionHidden(src: string): boolean {
    if (/<DevOnlyRoute>/.test(src)) return true;
    return /__DEV__\?: boolean/.test(src) && /<Redirect href="\/[a-z-]*"/.test(src);
  }

  it.each(DEV_ONLY_ROUTES)("/%s 은 프로덕션에서 감춰진다", (route) => {
    expect(isProductionHidden(readFileSync(join(APP, `${route}.tsx`), "utf8"))).toBe(true);
  });

  it("목록에 없는 라우트가 몰래 게이트를 쓰지 않는다", () => {
    // 반대 방향도 잡는다. 누가 사용자 화면에 DevOnlyRoute 를 붙이면 그 화면은
    // 프로덕션에서 통째로 사라지는데, 그건 조용히 일어나면 안 되는 종류의 일이다.
    const gated = routeFiles().filter((r) =>
      /<DevOnlyRoute>/.test(readFileSync(join(APP, `${r}.tsx`), "utf8")),
    );
    // trinity 는 인라인 게이트라 이 목록에 안 나온다 - 의도된 예외다.
    const viaComponent = DEV_ONLY_ROUTES.filter((r) => r !== "trinity");
    expect(gated.sort()).toEqual([...viaComponent].sort());
  });

  it("게이트는 dev 도 QA 도 아니면 홈으로 보낸다", () => {
    const route = readFileSync(join(APP, "..", "components", "ui", "DevOnlyRoute.tsx"), "utf8");
    const gate = readFileSync(join(APP, "..", "lib", "dev", "gate.ts"), "utf8");

    // 판정은 gate.ts 로 옮겼다 (2026-08-19). 설정의 진입 버튼이 라우트 게이트와
    // **같은 판단**을 써야 눌리는데 안 열리는 버튼이 안 생긴다.
    expect(route).toContain("isDevSurfaceEnabled()");
    expect(route).toContain('<Redirect href="/" />');

    // fail-closed 를 두 문 모두에서 강제한다. 런타임을 모르면 감춘다 —
    // 반대로 짜면(`!== false` 같은 형태) 프로덕션에 새어나간다.
    expect(gate).toContain("__DEV__ === true");
    expect(gate).toContain("EXPO_PUBLIC_ALLOW_DEV_TIER === true");
    // env 스키마가 깨져도 열리면 안 된다.
    expect(gate).toMatch(/catch\s*\{\s*[^}]*return false;/);
  });

  it("QA 문은 이미 있는 플래그만 쓴다", () => {
    // 새 플래그를 만들면 "배포 빌드에 하드코딩 true 가 없다" 를 강제하는 가드를
    // 하나 더 만들어야 한다. EXPO_PUBLIC_ALLOW_DEV_TIER 는 그 가드가
    // src/lib/progression/__tests__/dev-tier-not-live.test.ts 에 이미 있다.
    const gate = readFileSync(join(APP, "..", "lib", "dev", "gate.ts"), "utf8");
    const flags = [...gate.matchAll(/EXPO_PUBLIC_[A-Z_]+/g)].map((m) => m[0]);
    expect([...new Set(flags)]).toEqual(["EXPO_PUBLIC_ALLOW_DEV_TIER"]);
  });
});
