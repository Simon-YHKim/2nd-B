// A source card that says "this is where the answer came from" and then opens a
// LIST is not showing the source. It is showing the shelf the source is on.
//
// SecondB cites the user's own wiki pages as [[slug]] markers (lib/chat/sources.ts)
// and the chat renders those as tappable cards. The deep-space chrome resolved the
// slug to a page id and deep-linked /wiki?focusPageId (med#23). The legacy chrome
// did not: it carried a "once a slug->page resolver exists" note beside a bare
// router.push("/wiki"). One file, two behaviours - in a file whose own header
// promises "the send handler, RAG/citation parsing ... are byte-identical for both
// variants - there is NO logic fork".
//
// So this guard is shaped around the SYMPTOM, not the patch: a citation tap must
// never dismiss the drawer and land on the wiki list without first asking which
// page the slug names. Falling back to the list is still allowed - it just has to
// be what happens when the lookup misses, not what happens instead of it.
//
// Source assertions, not a render test: react-test-renderer is blocked on RN 0.85
// here, and the thing being guarded is a routing decision that lives in the source.
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");

// CRLF-normalised: this repo checks out CRLF on Windows, and a scanner that
// silently matches nothing still reports PASS.
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

const CHAT = "src/app/secondb.tsx";
const WIKI = "src/screens/deepspace/dds-wiki-records-screens.tsx";
const QUERIES = "src/lib/wiki/queries.ts";

describe("a cited piece opens the piece", () => {
  test("the scanner is reading the real chat screen", () => {
    const src = read(CHAT);
    expect(src.length).toBeGreaterThan(50_000);
    // Both chromes really do live in this one file, so "two drawers" is a fact
    // about the file rather than an assumption this test is making.
    expect(src).toContain('const isDeepSpace = variant === "deep-space";');
    expect(src).toContain("setRefDrawer(");
  });

  test("no citation tap closes the drawer and jumps straight to the wiki list", () => {
    // The exact shape the legacy drawer had. Nothing between the dismiss and the
    // push means nothing was ever looked up.
    const BLIND_JUMP = /setRefDrawer\(null\);\s*\n\s*router\.push\("\/wiki"\);/g;
    const hits = [...read(CHAT).matchAll(BLIND_JUMP)].map((h) => h[0]);
    expect(hits).toEqual([]);
  });

  test("the slug is resolved in exactly one place, so the two chromes cannot drift", () => {
    const src = read(CHAT);
    // One lookup...
    expect([...src.matchAll(/getWikiPage\(/g)]).toHaveLength(1);
    // ...reached from both drawers, and from nothing else.
    expect([...src.matchAll(/onPress=\{\(\) => openCitedPage\(slug\)\}/g)]).toHaveLength(2);
    // The miss still lands on the list: the old behaviour kept as a fallback,
    // not deleted.
    expect(src).toMatch(/else router\.push\("\/wiki"\);/);
    expect(src).toMatch(/\.catch\(\(\) => router\.push\("\/wiki"\)\)/);
  });

  test("the lookup is by slug, which is what a citation carries", () => {
    // Feeding a citation slug into a by-id lookup would resolve nothing, forever,
    // and would look from the outside exactly like the bug this file closes.
    const q = read(QUERIES);
    const from = q.indexOf("export async function getWikiPage(");
    expect(from).toBeGreaterThan(-1);
    const body = q.slice(from, q.indexOf("\n}", from));
    expect(body).toContain('.eq("slug", slug)');
  });

  test("the screen on the other end reads focusPageId", () => {
    // Sending a parameter nobody reads is a half-fix that looks whole - the
    // failure mode this repo already keeps a guard family for
    // (route-params-have-a-reader).
    const src = read(WIKI);
    expect(src).toMatch(/useLocalSearchParams<\{ focusPageId\?: string \}>\(\)/);
    expect(src).toMatch(/setExpandedId\(focusPageId\)/);
  });

  test("a cited page outside the loaded window is still fetched, not dropped", () => {
    // The screen loads a bounded slice of the library, most-recently-updated
    // first. The RAG citation path picks pages by vector neighbourhood
    // (lib/chat/rag.ts) with no recency floor, so it can cite a page well
    // outside that slice. The old effect gave up when the id was not in the
    // loaded list, and gave up SILENTLY - no toast, no error, just the default
    // row - which is indistinguishable from "the deep link is broken".
    const src = read(WIKI);
    // The window really is bounded, so "outside it" is a reachable state and
    // not a hypothetical this test invented.
    expect(src).toMatch(/listWikiPages\(userId, \{ limit: \d+ \}\)/);
    // ...and the absent row is pulled by id rather than abandoned.
    expect(src).toContain("getWikiPageById(userId, focusPageId)");
    // The fetched row has to reach what is actually drawn. Feeding the raw
    // loaded slice back into the view would pin an id that is not in it.
    expect(src).toMatch(/buildDeepWikiView\(listedPages,/);
  });

  test("a second citation is honoured on a wiki screen that is already open", () => {
    // The old guard was `if (!focusPageId || expandedId !== null) return;`.
    // Any expanded row - including the one the FIRST deep link opened - made
    // every later citation a no-op on a mounted /wiki. Honouring per id keeps
    // the original intent (do not fight a row the user opened by hand) while
    // letting a genuinely new target through.
    const src = read(WIKI);
    expect(src).not.toContain("if (!focusPageId || expandedId !== null) return;");
    expect(src).toContain("honouredFocusRef.current === focusPageId");
  });
});
