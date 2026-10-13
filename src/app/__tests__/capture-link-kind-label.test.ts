import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectClipperKind } from "@/lib/wiki/clipper-kind";

// Z114 (2026-10-13 device check): the hint under the link box read "링크 자동 인식: article".
// The detector's internal kind went into the sentence as it was. The hint now names the kind with
// the name the formats screen already shows for it, in every language.
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const SAMPLE_URLS = [
  "https://example.com/post",
  "https://www.youtube.com/watch?v=abc",
  "https://www.reddit.com/r/test/comments/1",
  "https://arxiv.org/abs/2401.00001",
  "https://github.com/owner/repo",
  "https://github.com",
  "not a url",
];

function kindNames(locale: string): Record<string, { name?: unknown }> {
  const file = join(__dirname, "..", "..", "..", "locales", locale, "formats.json");
  return JSON.parse(readFileSync(file, "utf8")).builtIn.kinds;
}

describe("the link hint names the kind in the reader's language", () => {
  const screen = readFileSync(join(__dirname, "..", "capture.tsx"), "utf8");

  test("the screen passes the localized name, not the detector's value", () => {
    expect(screen).toContain('t("linkClip.detected", { kind: t(`formats:builtIn.kinds.${detectedKind}.name`) })');
    expect(screen).not.toContain("{ kind: detectedKind }");
  });

  test.each(LOCALES)("%s has a name for every kind the detector can return", (locale) => {
    const names = kindNames(locale);
    const kinds = new Set(SAMPLE_URLS.map((url) => detectClipperKind(url)));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    for (const kind of kinds) {
      const name = names[kind]?.name;
      expect(typeof name).toBe("string");
      expect((name as string).trim().length).toBeGreaterThan(0);
      expect(name).not.toBe(kind);
    }
  });
});
