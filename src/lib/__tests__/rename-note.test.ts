import { readFileSync } from "node:fs";
import path from "node:path";

// PolaScope rename, 2026-09-27/28 (DECISIONS 26.09.28): the app surfaces say
// PolaScope, but until the Terms/consent amendment takes effect on 2026-10-05
// the consent text and the Terms still define the Service as 2nd-Brain. Simon
// chose that any publish before that date carries a "formerly 2nd-Brain" note on
// the five sign-up / consent / terms surfaces. This pins that note in place.
// Delete this file together with the note in the Terms/consent amendment PR.
const root = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("PolaScope rename note (until the 2026-10-05 Terms amendment)", () => {
  test("every locale carries common:app.renameNote naming both names", () => {
    for (const lng of ["en", "ko", "es", "pt", "id"]) {
      const common = JSON.parse(read(`locales/${lng}/common.json`)) as { app: { renameNote?: string } };
      const note = common.app.renameNote ?? "";
      expect(note).toContain("PolaScope");
      expect(note).toContain("2nd-Brain");
      expect(note).toMatch(/2026/);
    }
  });

  test("the five consent and terms surfaces render the note", () => {
    const surfaces = [
      "src/screens/deepspace/dds-sign-up-screen.tsx",
      "src/components/consent/ConsentNotice.tsx",
      "src/app/service-consent.tsx",
      "src/screens/deepspace/dds-consent-notice-screen.tsx",
      "src/screens/deepspace/dds-legal-doc-screen.tsx",
    ];
    for (const file of surfaces) {
      expect(read(file)).toContain('t("common:app.renameNote")');
    }
  });
});
