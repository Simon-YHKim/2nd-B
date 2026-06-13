import { readFileSync } from "node:fs";
import path from "node:path";

describe("visible trust copy", () => {
  test("plans copy avoids unsupported local-device storage claims", () => {
    const root = path.resolve(__dirname, "../../..");
    const en = readFileSync(path.join(root, "locales/en/plans.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/plans.json"), "utf8");

    expect(en).not.toMatch(/on your device|local brain|stays on your device/i);
    expect(ko).not.toMatch(/기기에|로컬/);
  });

  test("intro copy does not exclude saved sources", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "README.md",
      "locales/en/common.json",
      "locales/ko/common.json",
      "src/app/manual.tsx",
    ].map((file) => readFileSync(path.join(root, file), "utf8"));
    const text = files.join("\n");

    expect(text).not.toMatch(/built only from what you write/i);
    expect(text).not.toMatch(/쓴 것들로만/);
    expect(text).toMatch(/what you write and save/i);
    expect(text).toMatch(/쓰고 저장한 것들/);
  });

  test("SecondB limit and composer actions are locale-backed", () => {
    const root = path.resolve(__dirname, "../../..");
    const screen = readFileSync(path.join(root, "src/app/secondb.tsx"), "utf8");
    const en = readFileSync(path.join(root, "locales/en/secondb.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/secondb.json"), "utf8");

    expect(screen).not.toMatch(/accessibilityLabel="(?:Ask SecondB|View plans|Clear chat)"/);
    expect(screen).not.toMatch(/>\s*(?:Clear|View plans)\s*</);
    expect(en).toMatch(/"viewPlans": "View plans"/);
    expect(ko).toMatch(/"viewPlans": "플랜 보기"/);
  });

  test("sign-up offers a browse-before-commit path before account fields", () => {
    const root = path.resolve(__dirname, "../../..");
    const screen = readFileSync(path.join(root, "src/app/(auth)/sign-up.tsx"), "utf8");
    const en = readFileSync(path.join(root, "locales/en/auth.json"), "utf8");
    const ko = readFileSync(path.join(root, "locales/ko/auth.json"), "utf8");

    const browseIdx = screen.indexOf('t("signUp.browseBeforeCommit")');
    const emailIdx = screen.indexOf('t("signUp.email")');

    expect(browseIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(-1);
    expect(browseIdx).toBeLessThan(emailIdx);
    expect(screen).toContain('<Link href="/manual" asChild>');
    expect(en).toContain('"browseBeforeCommit": "Browse first, then decide"');
    expect(ko).toContain('"browseBeforeCommit": "먼저 둘러보고 결정하기"');
  });

  test("first-run capture copy stays honest about records, not guest graph storage", () => {
    const root = path.resolve(__dirname, "../../..");
    const en = JSON.parse(readFileSync(path.join(root, "locales/en/capture.json"), "utf8")) as {
      firstRun: { hint: string };
    };
    const ko = JSON.parse(readFileSync(path.join(root, "locales/ko/capture.json"), "utf8")) as {
      firstRun: { hint: string };
    };
    const combined = `${en.firstRun.hint}\n${ko.firstRun.hint}`;

    expect(en.firstRun.hint).toContain("first saved record");
    expect(en.firstRun.hint).toContain("Records");
    expect(ko.firstRun.hint).toContain("첫 기록");
    expect(ko.firstRun.hint).toContain("기록 보관소");
    expect(combined).not.toMatch(/graph|local|device|anonymous|no sign-up|no signup/i);
    expect(combined).not.toMatch(/그래프|로컬|기기|계정 없이/);
  });
});
