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
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const term of residue) {
        expect(source).not.toContain(term);
      }
    }
  });
});
