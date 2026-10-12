// A-Z first-use check, round 6 (Z91). One tip on the import screen addressed the reader as "네가"
// while the rest of the sentence, and the rest of the app, is in the polite register
// (the Korean register chosen on 2026-10-02: statements end in ~습니다, questions and offers in 해요체).
// The polite register does not use these pronouns at all, so none may come back.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "locales/ko");
const CASUAL_YOU = /(^|[\s"'「(])(네가|니가|너는|너의|너를|너에게|너도|너와)(?=[\s,.!?])/;

function strings(value: unknown, trail: string, out: [string, string][]): void {
  if (typeof value === "string") out.push([trail, value]);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) strings(child, `${trail}.${key}`, out);
  }
}

test("no Korean string addresses the reader with a casual pronoun", () => {
  const hits: string[] = [];
  let seen = 0;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const all: [string, string][] = [];
    strings(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")), file.replace(/\.json$/, ""), all);
    seen += all.length;
    for (const [key, text] of all) if (CASUAL_YOU.test(text)) hits.push(`${key}: ${text}`);
  }
  // Sight control: the walk really read the bundles.
  expect(seen).toBeGreaterThan(3000);
  expect(hits).toEqual([]);
});

test("the rule sees the sentence that prompted it", () => {
  expect(CASUAL_YOU.test("네가 승인한 것만 기록에 남습니다.")).toBe(true);
  expect(CASUAL_YOU.test("승인한 것만 기록에 남습니다.")).toBe(false);
  // 네 as a counter or an answer is not the pronoun.
  expect(CASUAL_YOU.test("네 걸음으로 안내합니다.")).toBe(false);
});
