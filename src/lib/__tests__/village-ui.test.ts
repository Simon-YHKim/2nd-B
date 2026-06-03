import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

import { VILLAGE_IDS } from "@/lib/graph/relatedness";
import { CORE_VILLAGE_UI, VILLAGE_UI } from "@/lib/village-ui";

function appTsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return appTsxFiles(fullPath);
    return fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("village UI metadata", () => {
  test("covers every graph village with a matching island and owner", () => {
    for (const id of VILLAGE_IDS) {
      expect(VILLAGE_UI[id].island).toBeTruthy();
      expect(VILLAGE_UI[id].worker).toBeTruthy();
      expect(VILLAGE_UI[id].accent).toBeTruthy();
      expect(VILLAGE_UI[id].speech.en).toBeTruthy();
      expect(VILLAGE_UI[id].speech.ko).toBeTruthy();
    }
    expect(VILLAGE_UI.imagine.worker).toBe("secondb");
  });

  test("keeps the graph center owned by SecondB", () => {
    expect(CORE_VILLAGE_UI.island).toBe("core");
    expect(CORE_VILLAGE_UI.worker).toBe("secondb");
  });

  test("keeps route heroes on shared village metadata", () => {
    const appRoot = path.join(process.cwd(), "src", "app");
    const violations = appTsxFiles(appRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      if (!source.includes("<SceneHero")) return [];
      const relative = path.relative(process.cwd(), file).replaceAll(path.sep, "/");
      const findings: string[] = [];
      if (/\bisland="[^"]+"/.test(source)) findings.push("hard-coded island prop");
      if (/\bworker="[^"]+"/.test(source)) findings.push("hard-coded worker prop");
      if (/\bislandSize=/.test(source)) findings.push("custom island size");
      if (/\bworkerSize=/.test(source)) findings.push("custom worker size");
      return findings.map((finding) => `${relative}: ${finding}`);
    });

    expect(violations).toEqual([]);
  });
});
