// Three screens held a WIKI PAGE id and pushed it at /record/[id].
//
//   router.push({ pathname: "/record/[id]", params: { id: p.from_page } })   // digest.tsx
//   router.push({ pathname: "/record/[id]", params: { id: p.from_page } })   // DeepSpaceDesignScreens
//   router.push({ pathname: "/record/[id]", params: { id: p.id } })          // dds-wiki (view.pages)
//
// `from_page` is a wiki_links column (see lib/wiki: ratifyLink(userId, p.from_page,
// p.to_page)), and `view.pages` comes from useWikiGraphData() -> listWikiPages(), so
// `p.id` is wiki_pages.id. /record/[id] looks the id up in `records` (or in `sources`
// when origin === "source"). A page id is neither. Every one of those taps was a
// guaranteed "찾을 수 없어요".
//
// They now go to /wiki?focusPageId=<id>, which is where a page id actually resolves.
//
// The rest of the /record/[id] call sites are FINE: they push record ids, and with
// origin absent the detail screen looks in `records`, which is correct. records.tsx is
// the only one that passes origin, and it is the only one that needs to. Making origin
// a required param would be churn, not a fix -- the defect was the id, not the origin.

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

// CRLF-normalized: the repo checks out CRLF on Windows, and a scanner that silently
// matches nothing still reports PASS.
const read = (f: string): string => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

const UI_FILES = [...sources(join(ROOT, "src/app")), ...sources(join(ROOT, "src/screens"))];

// The id expressions that are known to hold a WIKI PAGE id, not a record id.
const PAGE_ID_EXPRS = [
  "p.from_page",
  "p.to_page",
  "from_page",
  "to_page",
  "page.id",
  "wikiPage.id",
  // /research insight cards (2026-07-16): headline.id = graph-stats topHubs
  // (wiki_pages.id) and surprise.fromId = wiki_links.from_page. Both slipped
  // this scanner because the allow-list above never named them — the same
  // page-id-as-record-id bug shipped twice in the file this test guards.
  "view.headline!.id",
  "view.headline.id",
  "view.surprise!.fromId",
  "view.surprise.fromId",
  "headline.id",
  "surprise.fromId",
];

describe("a wiki page id is never used as a record id", () => {
  test("the scanner is reading real files", () => {
    expect(UI_FILES.length).toBeGreaterThan(50);
  });

  test("no /record/[id] push receives a wiki page id", () => {
    // Match the params object of every /record/[id] push.
    const PUSH = /pathname:\s*"\/record\/\[id\]"\s*,\s*params:\s*\{([^}]*)\}/g;
    const offenders: string[] = [];
    for (const f of UI_FILES) {
      for (const [, params] of read(f).matchAll(PUSH)) {
        const hit = PAGE_ID_EXPRS.find((e) => (params ?? "").includes(`id: ${e}`));
        if (hit) offenders.push(`${relative(ROOT, f)} passes ${hit} as a record id`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the fixed screens now send page ids to /wiki", () => {
    const expected: [string, string][] = [
      ["src/app/digest.tsx", "p.from_page"],
      ["src/screens/deepspace/DeepSpaceDesignScreens.tsx", "p.from_page"],
      ["src/screens/deepspace/dds-wiki-records-screens.tsx", "p.id"],
      // /research insight cards — the second occurrence of this bug (2026-07-16).
      ["src/screens/deepspace/DeepSpaceDesignScreens.tsx", "view.headline!.id"],
      ["src/screens/deepspace/DeepSpaceDesignScreens.tsx", "view.surprise!.fromId"],
    ];
    for (const [file, expr] of expected) {
      const src = read(join(ROOT, file));
      expect(src).toContain(`pathname: "/wiki", params: { focusPageId: ${expr} }`);
    }
  });

  test("the live wiki screen actually honours focusPageId", () => {
    // Adding the param to the callers is only half a fix if nothing reads it -- the kind
    // of half-fix that looks complete and does nothing.
    const src = read(join(ROOT, "src/screens/deepspace/dds-wiki-records-screens.tsx"));
    expect(src).toMatch(/useLocalSearchParams<\{ focusPageId\?: string \}>\(\)/);
    expect(src).toMatch(/setExpandedId\(focusPageId\)/);
    // And it must not blow past a stale/foreign id: guard on the page actually existing.
    expect(src).toMatch(/pages\.some\(\(p\) => p\.id === focusPageId\)/);
  });
});
