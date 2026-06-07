import { readFileSync } from "node:fs";
import path from "node:path";

describe("visible brand copy", () => {
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
});
