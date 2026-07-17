#!/usr/bin/env node
// Move the base64 screenshots embedded in docs/flow-debugger.html out to docs/flow-thumbs/*,
// leaving relative paths in the SHOTS map.
//
// WHY: the built html kept every thumbnail as a data URI inside ONE ~14MB line, so each
// re-capture rewrote the entire file — every merge paid the full blob into git history and
// the file was a standing merge conflict. As external files, a re-capture only rewrites the
// few pngs that actually changed.
//
// Contract (shared with the Flow-debugger plugin): the map lives between the exact markers
// 'const SHOTS = (' and ')||{}'. stamp-shots.js JSON-parses that slice and re-serializes it,
// so values may be data URIs (freshly stamped) or 'flow-thumbs/<name>' (already external) —
// both round-trip. flag-changed-screens.js only needs the markers to stay intact.
// Idempotent: safe to run after every stamp; prunes thumb files no route references anymore.
// src/lib/nav/__tests__/flow-debugger-thin.test.ts enforces the result at verify time.
import fs from "fs";
import path from "path";

const htmlPath = process.argv[2] || "docs/flow-debugger.html";
const thumbsDirName = "flow-thumbs";
const thumbsDir = path.join(path.dirname(htmlPath), thumbsDirName);

const html = fs.readFileSync(htmlPath, "utf8");
const marker = "const SHOTS = (";
const at = html.indexOf(marker);
if (at < 0) {
  console.error("SHOTS constant not found - is this a built flow-debugger.html?");
  process.exit(2);
}
const start = at + marker.length;
const end = html.indexOf(")||{}", start);
if (end < 0) {
  console.error('SHOTS terminator ")||{}" not found.');
  process.exit(2);
}

const shots = JSON.parse(html.slice(start, end));

// "/star/[domain]" -> "star__[domain]"; "/" -> "_root". Brackets/parens are fs-safe everywhere.
const slugFor = (route) => (route === "/" ? "_root" : route.replace(/^\//, "").replace(/\//g, "__"));
const EXT = { jpeg: "jpg" };

fs.mkdirSync(thumbsDir, { recursive: true });

let externalized = 0;
let kept = 0;
let missing = 0;
for (const [route, value] of Object.entries(shots)) {
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/s.exec(value);
  if (!m) {
    if (value.startsWith(`${thumbsDirName}/`)) {
      kept++;
      if (!fs.existsSync(path.join(path.dirname(htmlPath), value))) {
        missing++;
        console.error(`referenced thumb missing on disk: ${value} (route ${route})`);
      }
    }
    continue;
  }
  const buf = Buffer.from(m[2], "base64");
  const name = `${slugFor(route)}.${EXT[m[1]] ?? m[1]}`;
  const target = path.join(thumbsDir, name);
  if (!fs.existsSync(target) || !fs.readFileSync(target).equals(buf)) fs.writeFileSync(target, buf);
  shots[route] = `${thumbsDirName}/${name}`;
  externalized++;
}

// Prune thumbs no route points at anymore (renamed routes, dropped screens).
const referenced = new Set(
  Object.values(shots)
    .filter((v) => v.startsWith(`${thumbsDirName}/`))
    .map((v) => v.slice(thumbsDirName.length + 1)),
);
let pruned = 0;
for (const f of fs.readdirSync(thumbsDir)) {
  if (!referenced.has(f)) {
    fs.unlinkSync(path.join(thumbsDir, f));
    pruned++;
  }
}

if (externalized > 0) {
  const next = html.slice(0, start) + JSON.stringify(shots) + html.slice(end);
  fs.writeFileSync(htmlPath, next);
  console.log(
    `externalized ${externalized} thumb(s) (${kept} already external, ${pruned} pruned); ` +
      `${htmlPath} ${(html.length / 1e6).toFixed(1)}MB -> ${(next.length / 1e6).toFixed(1)}MB`,
  );
} else {
  console.log(`nothing to externalize (${kept} already external, ${pruned} pruned).`);
}
if (missing > 0) process.exitCode = 1;
