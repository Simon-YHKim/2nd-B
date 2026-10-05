import { readFileSync } from "node:fs";
import path from "node:path";

describe("visible graph copy", () => {
  test("primary runtime surfaces avoid visible Core suffix copy", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = [
      "src/app/core-brain.tsx",
      "src/app/index.tsx",
      "src/app/persona.tsx",
      "src/app/records.tsx",
      "src/app/wiki.tsx",
      "src/screens/deepspace/DeepSpaceFlowMapScreen.tsx",
    ];
    const residue = [
      "02. Core brain",
      "Opens Core Brain",
      "Open core",
      "in Core.",
      "Core logs",
      "core logs",
      "Core pieces",
      "this Core",
      'label: { en: "Core"',
      'label: { en: "Core", ko: "코어" }',
      "Core 로그",
      "이 Core",
      "소울코어",
      'en: "Soul Core"',
      'ko: "소울 코어"',
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const term of residue) {
        expect(source).not.toContain(term);
      }
    }
  });

  // 여기 있던 핀은 옛 홈 그래프 NavGraph 의 중앙 노드 라벨을 봤다. 그 화면은 어느
  // 빌드도 그리지 않았고 2026-10-04 에 파일째 E:/Legacy 로 갔다(QA L2-01 · L4-06).
  // 지키던 성질은 그대로 배송 홈으로 옮긴다: 사용자가 여는 별자리의 중심 노드는
  // "북극성" 이라 불리고 "소울 코어" 로 돌아가지 않는다.
  test("shipped home center node uses North Star copy", () => {
    const root = path.resolve(__dirname, "../../..");
    const home = readFileSync(path.join(root, "src/components/deep-space/ConstellationHome.tsx"), "utf8");
    const label = (locale: string): unknown => {
      const json = JSON.parse(readFileSync(path.join(root, `locales/${locale}/home.json`), "utf8"));
      return json?.ds?.home?.polaris;
    };

    // 보이는 글자와 스크린리더 이름이 같은 키를 쓴다.
    expect(home).toContain('{t("ds.home.polaris")}');
    expect(home).toContain('accessibilityLabel={t("ds.home.polaris")}');
    expect(label("en")).toBe("North Star");
    expect(label("ko")).toBe("북극성");
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      expect(label(locale)).toEqual(expect.any(String));
      expect(String(label(locale))).not.toMatch(/Soul Core|소울\s*코어|Núcleo d(?:el|a) alma|Inti Jiwa/i);
    }
  });
});
