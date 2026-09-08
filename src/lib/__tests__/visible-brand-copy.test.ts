import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("visible brand copy", () => {
  test("auth screens render the canonical app-name token", () => {
    const root = path.resolve(__dirname, "../../..");
    const signIn = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8");
    const signUp = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-up-screen.tsx"), "utf8");

    // 2026-09-08: 두 화면이 **같은 키로 모였다.** 여기에는 "/sign-in 은 아직
    // 레거시 렌더러라 common:app.name 을 쓴다" 고 적혀 있었는데, 그건 검사가
    // 배송 안 되는 반쪽을 읽고 있었기 때문이다. 배송되는 두 화면은 둘 다
    // deepspace:auth.brandLabel 을 쓴다. 요점은 그대로 — 브랜드는 리터럴이 아니라
    // 토큰으로 낸다.
    expect(signIn).toContain('t("deepspace:auth.brandLabel")');
    expect(signUp).toContain('t("deepspace:auth.brandLabel")');
    expect(signIn).not.toContain("2ND-BRAIN");
  });

  test("auth screens keep a visible home back affordance beside the brand", () => {
    const root = path.resolve(__dirname, "../../..");
    const signIn = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-in-screen.tsx"), "utf8");
    const signUp = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-up-screen.tsx"), "utf8");

    // 계약은 셋이다: 홈으로 가는 컨트롤이 있고 · 라벨이 토큰이며 · 브랜드 옆에 있다.
    // 스타일 **이름**을 핀으로 박으면 표현이 바뀔 때마다 계약이 아니라 이름을 지킨다.
    //
    // ⚠ 배송 /sign-in 에는 그 컨트롤이 **없다. 그리고 없는 것이 맞다** —
    // src/app/index.tsx:455 가 로그아웃 사용자를 그대로 /sign-in 으로 되돌리므로
    // 레거시의 "홈으로"는 자기 화면으로 오는 제자리 고리였다. /sign-up 에서는
    // 뒤로가기가 /sign-in 이라는 실제 목적지를 가지므로 그쪽 계약은 남는다.
    // 기능이 줄어든 것이 아니라 고리가 하나 빠졌다.
    expect(signUp).toContain('router.push("/")');
    expect(signUp).toContain('t("common:navGraph.drilldown.back")');
    expect(signUp).toContain("styles.topBar");
    expect(signUp).toContain("styles.brand");
    // /sign-in 은 브랜드만 남았다 — 자리를 비워두지 않았음을 확인한다.
    expect(signIn).toContain("styles.brand");
    expect(signIn).not.toContain('router.push("/")');
  });

  test("app surfaces use 2nd-Brain instead of informal 2nd-B or 2ndB", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "locales/en/consent.json",
      "locales/ko/consent.json",
      "locales/en/import.json",
      "locales/ko/import.json",
      "locales/en/permissions.json",
      "locales/ko/permissions.json",
      "locales/en/support.json",
      "locales/ko/support.json",
      "src/app/manual.tsx",
      "src/components/premium/surfaces.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/2nd-B(?!rain)|2ndB/);
    }
  });

  test("Korean locale copy uses 세컨비 for the AI companion", () => {
    const root = path.resolve(__dirname, "../../..");
    const localeDir = path.join(root, "locales/ko");

    for (const file of readdirSync(localeDir).filter((name) => name.endsWith(".json"))) {
      const source = readFileSync(path.join(localeDir, file), "utf8");
      expect(source).not.toMatch(/\bSecondB\b/);
    }

    const appFiles = [
      "src/app/core-brain.tsx",
      "src/app/secondb.tsx",
      "src/app/settings.tsx",
      "src/app/wiki.tsx",
      "src/components/premium/tab-bar.tsx",
      "src/components/ui/BackArrow.tsx",
    ];

    for (const file of appFiles) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/세컨드비/);
    }
  });

  test("floating back arrow labels the core-brain route as North Star", () => {
    const root = path.resolve(__dirname, "../../..");
    const backArrow = readFileSync(path.join(root, "src/components/ui/BackArrow.tsx"), "utf8");

    expect(backArrow).toContain('"/core-brain": { en: "North Star", ko: "북극성" }');
    expect(backArrow).not.toContain('"/core-brain": { en: "Soul Core"');
    expect(backArrow).not.toContain('ko: "소울 코어"');
  });
});
