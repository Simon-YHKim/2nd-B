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
      "src/components/ui/BackArrow.tsx",
    ];
    const residue = [
      "02. Core brain",
      "Opens Core Brain",
      "Open core",
      "in Core.",
      "Core logs",
      "core logs",
      "Core pieces",
      '"/core-brain": { en: "Soul Core"',
      '"/core-brain": { en: "North Star", ko: "소울 코어" }',
      "this Core",
      'label: { en: "Core"',
      'label: { en: "Core", ko: "코어" }',
      "Core 로그",
      "이 Core",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const term of residue) {
        expect(source).not.toContain(term);
      }
    }
  });

  test("wiki facet names the aggregate screen as North Star", () => {
    const root = path.resolve(__dirname, "../../..");
    const wiki = readFileSync(path.join(root, "src/app/wiki.tsx"), "utf8");

    expect(wiki).toContain('label: { en: "North Star", ko: "북극성" }');
    expect(wiki).not.toContain('label: { en: "Soul Core", ko: "소울 코어" }');
  });
});
