// The old tier names Soma / Cortex / Brain are legacy (Simon, 2026-10-14). People have seen
// 별바라기 · 항해자 · 북극성 (Stargazer · Voyager · North Star) since #703 (2026-07-03), and soma
// stopped selling on 2026-07-30 (#1140). The internal keys free / soma / cortex / brain stay as
// they are in code, database and server; only the words people see changed. Two places still
// showed the old words: the journal advisor lock line on /capture ("(Brain)", "Brain 요금제")
// and the plans.json f2 / f3 lines ("Everything in Soma", "Soma의 모든 기능").
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const localesDir = path.join(root, "locales");

// Case-sensitive whole word. "Whole word" means no Latin letter on either side, so a Korean
// particle glued to the name still counts ("Soma의 모든 기능" was one of the hits, and \b misses
// it), while keys like "coreBrain", words like "Brainstorm" and lowercase "second brain" do not.
// 브레인스토밍 (brainstorming) is an ordinary Korean word, not the tier.
const LEGACY_TIER_NAME = /(?<![A-Za-z])(?:Soma|Cortex|Brain)(?![A-Za-z])|소마|코텍스|코르텍스|브레인(?!스토밍)/;

// No exemptions: after this change the scan finds nothing in locales/*/*.json on origin/main.
// If a legitimate use ever appears, exempt it here by exact key path ("<lang>/<file>.<key>")
// with the reason next to it, rather than loosening the pattern.

function strings(value: unknown, trail: string, out: [string, string][]): void {
  if (typeof value === "string") out.push([trail, value]);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) strings(child, `${trail}.${key}`, out);
  }
}

test("no locale string names a tier by its legacy name", () => {
  const hits: string[] = [];
  let seen = 0;
  for (const lang of fs.readdirSync(localesDir)) {
    const dir = path.join(localesDir, lang);
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const all: [string, string][] = [];
      strings(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")), `${lang}/${file.replace(/\.json$/, "")}`, all);
      seen += all.length;
      for (const [key, text] of all) if (LEGACY_TIER_NAME.test(text)) hits.push(`${key}: ${text}`);
    }
  }
  // Sight control: the walk really read every language's bundles (21,985 strings on 2026-10-14).
  expect(seen).toBeGreaterThan(15000);
  expect(hits).toEqual([]);
});

test("the rule sees the strings that prompted it", () => {
  expect(LEGACY_TIER_NAME.test("Ask HustleK about this entry (Brain)")).toBe(true);
  expect(LEGACY_TIER_NAME.test("기록에 대한 답변은 Brain 요금제에서 받을 수 있습니다.")).toBe(true);
  expect(LEGACY_TIER_NAME.test("Soma의 모든 기능")).toBe(true);
  expect(LEGACY_TIER_NAME.test("Everything in Cortex")).toBe(true);
  expect(LEGACY_TIER_NAME.test("코르텍스 요금제")).toBe(true);
  // Not the tier name.
  expect(LEGACY_TIER_NAME.test("coreBrain")).toBe(false);
  expect(LEGACY_TIER_NAME.test("your second brain")).toBe(false);
  expect(LEGACY_TIER_NAME.test("Brainstorm a list")).toBe(false);
  expect(LEGACY_TIER_NAME.test("브레인스토밍")).toBe(false);
  expect(LEGACY_TIER_NAME.test("기록에 대한 답변은 북극성 요금제에서 받을 수 있습니다.")).toBe(false);
});

// App code. A tier name shown to people is a string literal that is exactly "Soma", "Cortex" or
// "Brain"; the internal keys are lowercase, so the case-sensitive rule never mistakes a key for a
// display word. Comment lines are skipped.
const DISPLAY_LITERAL = /(["'`])(?:Soma|Cortex|Brain)\1/;

// TODO(PR-1 chat limit bubble): TIER_DISPLAY in src/lib/chat/conversation.ts still turns the
// upgrade tier into "Soma" / "Cortex" / "Brain" in the chat limit bubble. It waits for an owner
// decision and changes in its own PR; when that PR lands, this becomes {}.
const PENDING_DISPLAY_LITERALS: Record<string, number> = { "src/lib/chat/conversation.ts": 3 };

function sourceFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") sourceFiles(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) out.push(path.join(dir, entry.name));
  }
}

test("only the pending chat limit bubble still shows a legacy tier name in app code", () => {
  const files: string[] = [];
  sourceFiles(path.join(root, "src"), files);
  const found: Record<string, number> = {};
  for (const file of files) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
      if (!DISPLAY_LITERAL.test(line)) continue;
      const rel = path.relative(root, file).split(path.sep).join("/");
      found[rel] = (found[rel] ?? 0) + 1;
    }
  }
  // Sight control: the walk read the app (946 files on 2026-10-14). The pending map itself is the
  // second control: while it stands, the scan must find its three lines.
  expect(files.length).toBeGreaterThan(500);
  expect(found).toEqual(PENDING_DISPLAY_LITERALS);
});
