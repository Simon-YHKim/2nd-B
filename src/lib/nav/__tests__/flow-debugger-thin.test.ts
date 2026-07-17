// docs/flow-debugger.html once carried all ~70 screen captures as base64 inside ONE ~14MB
// line, so ANY re-capture rewrote the whole file: every merge paid the full blob into git
// history (+10s of MB each) and the file was a standing merge conflict. The thumbnails now
// live in docs/flow-thumbs/* and the SHOTS map holds relative paths — a re-capture rewrites
// only the few pngs that changed.
//
// This guard keeps it that way. A full flow-debugger rebuild (the plugin embeds base64 by
// design) will trip it — that is the point: run `node scripts/flow/externalize-thumbs.mjs`
// before committing, exactly what CI's flow-thumbnails.yml does after stamping.
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const HTML_PATH = join(ROOT, "docs", "flow-debugger.html");
const html = readFileSync(HTML_PATH, "utf8").replace(/\r\n/g, "\n");

// The exact markers stamp-shots.js / flag-changed-screens.js / externalize-thumbs.mjs share.
const MARKER = "const SHOTS = (";
const TERMINATOR = ")||{}";

describe("flow-debugger.html stays thin (thumbnails external)", () => {
  it("keeps the SHOTS marker contract the whole pipeline parses", () => {
    expect(html).toContain(MARKER);
    expect(html.indexOf(TERMINATOR, html.indexOf(MARKER))).toBeGreaterThan(-1);
  });

  it("embeds no large base64 image payloads (run scripts/flow/externalize-thumbs.mjs)", () => {
    const uris = html.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g) ?? [];
    const oversized = uris.filter((u) => u.length > 10_000).map((u) => `${u.slice(0, 40)}… (${u.length} chars)`);
    expect(oversized).toEqual([]);
  });

  it("resolves every SHOTS thumb reference to a committed file", () => {
    const start = html.indexOf(MARKER) + MARKER.length;
    const shots = JSON.parse(html.slice(start, html.indexOf(TERMINATOR, start))) as Record<string, string>;
    const entries = Object.entries(shots).filter(([, v]) => v.startsWith("flow-thumbs/"));
    // A rebuilt map with zero external refs would vacuously pass the check above — pin it.
    expect(entries.length).toBeGreaterThan(0);
    const missing = entries.filter(([, v]) => !existsSync(join(ROOT, "docs", v))).map(([route, v]) => `${route} -> ${v}`);
    expect(missing).toEqual([]);
  });
});
