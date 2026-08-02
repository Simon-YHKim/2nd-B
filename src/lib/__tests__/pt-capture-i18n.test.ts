import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Portuguese capture copy", () => {
  test("link capture labels are localized", () => {
    const capture = JSON.parse(readFileSync(join(process.cwd(), "locales/pt/capture.json"), "utf8"));

    expect(capture.hero.subtitle).toContain("ligação");
    expect(capture.sections.mode.moreHint).toContain("ligação");
    expect(capture.modes.linkclip.label).toBe("Ligação");
    expect(capture.linkClip.label).toBe("Ligação ou artigo salvo");
    expect(capture.linkClip.detected).toBe("Ligação detectada: {{kind}}");
  });
});
