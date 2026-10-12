// A-Z first-use check, round 5 (Z85, device). With Meta-B or Twi-B selected, a screen reader still
// read the input as "Ask HustleK" and every answer as "HustleK answer": both names were fixed text.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

type Bundle = {
  inputA11y: string;
  secondbAnswer: string;
  // rev2 holds the three personas (secondb, meta, twi) next to a few plain strings.
  rev2: Record<string, { lensName?: string } | string>;
};

describe.each(LOCALES)("%s", (lng) => {
  const bundle = JSON.parse(read(`locales/${lng}/secondb.json`)) as Bundle;
  const names = Object.values(bundle.rev2)
    .map((persona) => (typeof persona === "string" ? undefined : persona.lensName))
    .filter((name): name is string => typeof name === "string");

  test("both names take the persona's name instead of spelling one out", () => {
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const value of [bundle.inputA11y, bundle.secondbAnswer]) {
      expect(value).toContain("{{name}}");
      for (const name of names) expect(value).not.toContain(name);
    }
  });
});

describe("the chat screen passes the name", () => {
  const screen = read("src/app/secondb.tsx");

  test("the input is named after the persona that is selected now", () => {
    expect(screen).toContain('askLabel={t("inputA11y", { name: t(`rev2.${rev2Persona}.lensName`) })}');
    expect(screen).toContain("accessibilityLabel={askLabel}");
    expect(screen).not.toContain('accessibilityLabel={t("inputA11y")}');
  });

  test("an answer is named after the persona that gave it, not the one selected now", () => {
    expect(screen).toContain('t("secondbAnswer", { name: t(`rev2.${turn.persona ?? "secondb"}.lensName`) })');
    expect(screen).not.toMatch(/t\("secondbAnswer"\)/);
  });
});
