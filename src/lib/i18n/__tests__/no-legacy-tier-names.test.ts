// The old tier names Soma / Cortex / Brain are legacy (Simon, 2026-10-14). People have seen
// 별바라기 · 항해자 · 북극성 (Stargazer · Voyager · North Star) since #703 (2026-07-03), and soma
// stopped selling on 2026-07-30 (#1140). The internal keys free / soma / cortex / brain stay as
// they are in code, database and server; only the words people see changed. Two places still
// showed the old words: the journal advisor lock line on /capture-full ("(Brain)", "Brain 요금제")
// and the plans.json f2 / f3 lines ("Everything in Soma", "Soma의 모든 기능").
//
// Two rules, because the two places hold different things:
// - Shown text (locale values, the canon screens.json copies): every string there is something a
//   person reads, so soma / cortex / brain count in any casing as a whole word ("(brain)",
//   "Everything in soma", "(BrAiN)"). Ordinary uses ("a second brain") are listed one by one.
// - App code (string literals, template pieces and JSX text under src): the same lowercase words are
//   also the internal keys ("brain", tier === "brain", "?tier=brain", the route "core-brain"), and a
//   string node cannot tell a key from a sentence. So code is checked for the shown form (Brain),
//   all capitals (BRAIN), and any casing next to a plan word ("brain plan", "BRAIN 요금제"); a
//   lowercase name standing alone in code is left to the review.
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const root = process.cwd();

// "Whole word" means no Latin letter on either side, so a Korean particle glued to the name still
// counts ("Soma의 모든 기능" was a hit, and \b misses it), while "coreBrain" and "Brainstorm" do not.
// 브레인스토밍 (brainstorming) is a different word.
const KOREAN_NAMES = /소마|코텍스|코르텍스|브레인(?!스토밍)/;

const SHOWN_TEXT_RULE: readonly RegExp[] = [
  /(?<![A-Za-z])(?:soma|cortex|brain)(?![A-Za-z])/i,
  KOREAN_NAMES,
];

const APP_CODE_RULE: readonly RegExp[] = [
  /(?<![A-Za-z])(?:Soma|Cortex|Brain)(?![A-Za-z])/,
  // Digits and underscores count as part of the word, so environment names (FORCE_TIER_BRAIN) stay out.
  /(?<![A-Za-z0-9_])(?:SOMA|CORTEX|BRAIN)(?![A-Za-z0-9_])/,
  /(?<![A-Za-z])(?:soma|cortex|brain)\s*(?:plans?|tiers?|요금제|플랜|등급)(?![A-Za-z])/i,
  /(?<![A-Za-z])(?:plans?|plano|paket|tiers?|요금제|플랜|등급)\s+(?:soma|cortex|brain)(?![A-Za-z])/i,
  KOREAN_NAMES,
];

const matches = (rule: readonly RegExp[], text: string): boolean => rule.some((r) => r.test(text));

// An exemption is one exact place and one exact string, never a pattern: a locale key path
// ("<lang>/<namespace>.<key path>"), a canon file and key path ("<file>:<key path>") or a source
// file, plus the string's full text. If either changes, the string is checked again. An exemption
// nothing matches any more also fails.
interface Exemption {
  where: string;
  text: string;
  reason: string;
}

const LOCALE_EXEMPTIONS: readonly Exemption[] = [
  {
    where: "en/common.app.tagline",
    text: "A second brain built from what you write and save.",
    reason: "\"a second brain\" is the ordinary phrase for a personal note system, not the tier",
  },
  {
    where: "en/deepspace.graph.title",
    text: "My brain map",
    reason: "the brain as in the mind (the wiki graph's title), not the tier",
  },
];

const CANON_SCREENS = ["public/proto/data/app/screens.json", "design/proto_rev2/reference-app/data/app/screens.json"];

const CANON_EXEMPTIONS: readonly Exemption[] = CANON_SCREENS.map((file) => ({
  where: `${file}:screens.4.route`,
  text: "core-brain",
  reason: "route id of the 북극성 screen (/core-brain), a path segment, not shown text; its title is 북극성",
}));

const SOURCE_EXEMPTIONS: readonly Exemption[] = [
  {
    where: "src/lib/google/calendar.ts",
    text: "PRODID:-//2nd-Brain//Google Calendar import//EN",
    reason: "iCalendar PRODID (RFC 5545) names the product that wrote the file; 2nd-Brain is the old product name, not a tier, and the file is parsed back by the app, not shown",
  },
  {
    where: "src/lib/ops/push.ts",
    text: "PRODID:-//2nd-Brain//ops//EN",
    reason: "iCalendar PRODID (RFC 5545) of the hand-off .ics; the old product name, not a tier, and calendar apps do not show it",
  },
];

interface Found {
  where: string;
  at: string;
  text: string;
}

function check(rule: readonly RegExp[], found: readonly Found[], exemptions: readonly Exemption[]): { hits: string[]; unused: Exemption[] } {
  const used = new Set<Exemption>();
  const hits: string[] = [];
  for (const item of found) {
    if (!matches(rule, item.text)) continue;
    const exemption = exemptions.find((e) => e.where === item.where && e.text === item.text);
    if (exemption) used.add(exemption);
    else hits.push(`${item.at}: ${item.text}`);
  }
  return { hits, unused: exemptions.filter((e) => !used.has(e)) };
}

function strings(value: unknown, trail: string, out: Found[]): void {
  if (typeof value === "string") out.push({ where: trail, at: trail, text: value });
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      strings(child, trail.endsWith(":") ? `${trail}${key}` : `${trail}.${key}`, out);
    }
  }
}

const readJson = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

test("no locale string names a tier by its legacy name", () => {
  const localesDir = path.join(root, "locales");
  const found: Found[] = [];
  for (const lang of fs.readdirSync(localesDir)) {
    for (const file of fs.readdirSync(path.join(localesDir, lang)).filter((name) => name.endsWith(".json"))) {
      strings(readJson(`locales/${lang}/${file}`), `${lang}/${file.replace(/\.json$/, "")}`, found);
    }
  }
  // Sight control: the walk really read every language's bundles (21,985 strings on 2026-10-14).
  expect(found.length).toBeGreaterThan(15000);
  expect(check(SHOWN_TEXT_RULE, found, LOCALE_EXEMPTIONS)).toEqual({ hits: [], unused: [] });
});

test("no canon screen string names a tier by its legacy name, in both copies", () => {
  const found: Found[] = [];
  for (const file of CANON_SCREENS) strings(readJson(file), `${file}:`, found);
  // Sight control: both copies were read (457 strings each on 2026-10-14).
  expect(found.length).toBeGreaterThan(800);
  expect(check(SHOWN_TEXT_RULE, found, CANON_EXEMPTIONS)).toEqual({ hits: [], unused: [] });
  // The app reads public/proto; the reference app keeps the other copy. They must not drift apart.
  expect(readJson(CANON_SCREENS[1])).toEqual(readJson(CANON_SCREENS[0]));
});

test("each rule sees the strings that prompted it and leaves the rest alone", () => {
  const prompted = [
    "Ask HustleK about this entry (Brain)",
    "기록에 대한 답변은 Brain 요금제에서 받을 수 있습니다.",
    "Soma의 모든 기능",
    "Everything in Cortex",
    "⚠ 트위비는 Brain(pro) 전용",
    "브레인 트리니티 (은퇴)",
    "코르텍스 요금제",
    "Upgrade to BRAIN",
    "the brain plan",
    "BRAIN 요금제",
    "cortex 등급",
    "el plano brain",
  ];
  for (const text of prompted) {
    expect([text, matches(SHOWN_TEXT_RULE, text), matches(APP_CODE_RULE, text)]).toEqual([text, true, true]);
  }
  // Shown text only: a lowercase or mixed-case name standing alone. In code it would also match keys.
  for (const text of ["(brain)", "Everything in soma", "(BrAiN)", "A second brain built from what you write and save.", "\"brain\""]) {
    expect([text, matches(SHOWN_TEXT_RULE, text), matches(APP_CODE_RULE, text)]).toEqual([text, true, false]);
  }
  // Neither: not the name, or not a word of its own.
  for (const text of [
    "coreBrain",
    "Brainstorm a list",
    "브레인스토밍",
    "기록에 대한 답변은 북극성 요금제에서 받을 수 있습니다.",
    "⚠ 트위비는 북극성(pro) 전용",
  ]) {
    expect([text, matches(SHOWN_TEXT_RULE, text), matches(APP_CODE_RULE, text)]).toEqual([text, false, false]);
  }
  // Code lets internal keys and environment names through: "?tier=brain" is a key in a path.
  expect(matches(APP_CODE_RULE, "/core-brain?tier=brain")).toBe(false);
  expect(matches(APP_CODE_RULE, "확인하려면 EXPO_PUBLIC_FORCE_TIER=brain")).toBe(false);
  expect(matches(APP_CODE_RULE, "FORCE_TIER_BRAIN")).toBe(false);
});

test("a use that is not a tier needs its own exact exemption", () => {
  const found: Found[] = [{ where: "ko/common.tagline", at: "ko/common.tagline", text: "세컨드 브레인처럼 쓰는 기록" }];
  const exempt: Exemption = { where: "ko/common.tagline", text: "세컨드 브레인처럼 쓰는 기록", reason: "a phrase, not a tier" };
  // Without the entry it fails; with it, it passes.
  expect(check(SHOWN_TEXT_RULE, found, []).hits).toEqual(["ko/common.tagline: 세컨드 브레인처럼 쓰는 기록"]);
  expect(check(SHOWN_TEXT_RULE, found, [exempt])).toEqual({ hits: [], unused: [] });
  // The entry is not a pattern: another key, or the same key with other words, is checked again.
  expect(check(SHOWN_TEXT_RULE, [{ ...found[0], where: "ko/common.title", at: "ko/common.title" }], [exempt]).hits).toHaveLength(1);
  expect(check(SHOWN_TEXT_RULE, [{ ...found[0], text: "세컨드 브레인 요금제" }], [exempt]).hits).toHaveLength(1);
  // An entry that nothing matches any more is reported, so the list cannot rot.
  expect(check(SHOWN_TEXT_RULE, [], [exempt]).unused).toEqual([exempt]);
});

// TODO(PR-1 chat limit bubble): TIER_DISPLAY in src/lib/chat/conversation.ts still turns the upgrade
// tier into "Soma" / "Cortex" / "Brain" in the chat limit bubble. It waits for an owner decision and
// changes in its own PR; when that PR lands, set this to null. Until then exactly the three value
// nodes of TIER_DISPLAY's soma / cortex / brain properties pass, and nothing else in that file does.
const PENDING_TIER_DISPLAY: { file: string; keys: readonly string[] } | null = {
  file: "src/lib/chat/conversation.ts",
  keys: ["soma", "cortex", "brain"],
};

function tierDisplayValues(source: ts.SourceFile, keys: readonly string[]): ts.Expression[] {
  const values: ts.Expression[] = [];
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "TIER_DISPLAY"
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && keys.includes(property.name.text)) {
          values.push(property.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return values;
}

function parse(rel: string): ts.SourceFile {
  const file = path.join(root, rel);
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
}

function sourceFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") sourceFiles(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
    }
  }
}

test("no app string names a tier by its legacy name, except the pending chat limit bubble", () => {
  const files: string[] = [];
  sourceFiles(path.join(root, "src"), files);
  const found: Found[] = [];
  let pendingSeen = 0;
  for (const rel of files) {
    const source = parse(rel);
    const pending = new Set(PENDING_TIER_DISPLAY && rel === PENDING_TIER_DISPLAY.file
      ? tierDisplayValues(source, PENDING_TIER_DISPLAY.keys).map((node) => node.getStart())
      : []);
    // Comments are not nodes, so they are never read.
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node)
        || ts.isTemplateTail(node) || ts.isJsxText(node)) {
        if (pending.has(node.getStart())) pendingSeen += 1;
        else {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          found.push({ where: rel, at: `${rel}:${line}`, text: node.text });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  // Sight control: the walk read the app (946 files, 63,496 string nodes and the three pending values
  // on 2026-10-14).
  expect(files.length).toBeGreaterThan(500);
  expect(found.length).toBeGreaterThan(40000);
  expect(pendingSeen).toBe(PENDING_TIER_DISPLAY ? PENDING_TIER_DISPLAY.keys.length : 0);
  expect(check(APP_CODE_RULE, found, SOURCE_EXEMPTIONS)).toEqual({ hits: [], unused: [] });
});

test("the pending exception is exactly TIER_DISPLAY's three legacy values", () => {
  const pending = PENDING_TIER_DISPLAY ?? { file: "src/lib/chat/conversation.ts", keys: [] };
  const values = tierDisplayValues(parse(pending.file), pending.keys)
    .map((node) => (ts.isStringLiteralLike(node) ? node.text : node.getText()));
  // When PR-1 renames them, this fails and PENDING_TIER_DISPLAY becomes null.
  expect(values).toEqual(PENDING_TIER_DISPLAY ? ["Soma", "Cortex", "Brain"] : []);
});
