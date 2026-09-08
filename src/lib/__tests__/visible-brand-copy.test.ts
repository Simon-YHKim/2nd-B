import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

describe("visible brand copy", () => {
  test("auth screens render the canonical app-name token", () => {
    const root = path.resolve(__dirname, "../../..");
    const signIn = readFileSync(path.join(root, "src/app/(auth)/sign-in.tsx"), "utf8");
    const signUp = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-up-screen.tsx"), "utf8");

    // ⚠ 두 화면이 같은 계약을 **다른 키**로 표현한다. /sign-in 은 아직 레거시
    // 렌더러를 품은 라우트라 common:app.name 을 쓰고, 배송되는 /sign-up 화면은
    // deepspace:auth.brandLabel 을 쓴다. 요점은 "브랜드를 리터럴이 아니라 토큰으로
    // 낸다" 이므로 각자의 토큰을 확인한다 — 한 키로 묶으면 둘 중 하나가 거짓이 된다.
    expect(signIn).toContain('t("common:app.name")');
    expect(signUp).toContain('t("deepspace:auth.brandLabel")');
    expect(signIn).not.toContain("2ND-BRAIN");
  });

  test("auth screens keep a visible home back affordance beside the brand", () => {
    const root = path.resolve(__dirname, "../../..");
    const signIn = readFileSync(path.join(root, "src/app/(auth)/sign-in.tsx"), "utf8");
    const signUp = readFileSync(path.join(root, "src/screens/deepspace/dds-sign-up-screen.tsx"), "utf8");

    // 계약은 셋이다: 홈으로 가는 컨트롤이 있고 · 라벨이 토큰이며 · 브랜드 옆에 있다.
    // 스타일 **이름**은 두 화면이 다르다(레거시 authBackButton/brandSlot vs
    // 배송 topBar/squareAction/brand). 이름을 핀으로 박으면 표현이 바뀔 때마다
    // 계약이 아니라 이름을 지키게 된다.
    for (const source of [signIn, signUp]) {
      expect(source).toContain('router.push("/")');
      expect(source).toContain('t("common:navGraph.drilldown.back")');
    }
    expect(signIn).toContain("styles.authBackButton");
    expect(signIn).toContain("styles.brandSlot");
    // 배송 /sign-up: 같은 줄에 뒤로가기 · 브랜드 · 언어 토글이 놓인다.
    expect(signUp).toContain("styles.topBar");
    expect(signUp).toContain("styles.brand");
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
