// Legal pages generator - docs/legal/*.md -> public/legal/*.html
//
// Paddle account verification checks the WEBSITE for public terms / privacy /
// refund pages before the form is even filled (dispatch 260720, item 1). The
// markdown sources are canonical; these HTML twins are COMMITTED build
// artifacts, not a build-time pipeline step - the web deploy stays
// dependency-free. Regenerate after editing any docs/legal source:
//
//   node scripts/build-legal-html.mjs
//
// Output contract (host-independent by design - the final hosting root is
// undecided, GitHub Pages vs a root domain):
//   - zero external references: no CSS/JS/font/CDN URLs, styles inlined
//   - zero relative assets: the only relative hrefs are the three sibling
//     legal pages themselves (cross-linking is a dispatch requirement)
//   - self-contained per file: any single file renders anywhere as-is
//   - dark mode via prefers-color-scheme, mobile viewport, lang + title set
//   - U+2014 em dashes in the sources are normalized to hyphens (DESIGN.md
//     forbids em dashes in user-facing strings; meaning is unchanged)
//
// Deliberately zero-dependency: the tiny markdown subset these three
// documents use (h1/h2/h3, bold, inline code, tables, unordered lists,
// full-line _meta_ lines, hr, links, backslash escapes) is parsed here;
// anything outside that subset fails loudly rather than rendering wrong.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Optional output directory override (first CLI argument). The freshness gate
// (scripts/check-legal-html-fresh.ts, wired into npm run verify) regenerates
// into a temp dir and diffs against the committed public/legal pages, so a
// docs/legal edit that skips regeneration fails CI instead of silently
// shipping stale public pages.
const OUT_DIR = process.argv[2] ? process.argv[2] : join(ROOT, "public", "legal");

const PAGES = [
  { src: "terms-of-service.md", out: "terms.html", nav: "이용약관 · Terms" },
  { src: "privacy-policy.md", out: "privacy.html", nav: "개인정보처리방침 · Privacy" },
  { src: "refund-policy.md", out: "refund.html", nav: "환불정책 · Refunds" },
];

// Cross-document links inside the sources point at sibling .md files; the
// HTML twins must point at the sibling .html files instead.
const LINK_MAP = new Map([
  ["./terms-of-service.md", "./terms.html"],
  ["./privacy-policy.md", "./privacy.html"],
  ["./refund-policy.md", "./refund.html"],
]);

function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Inline markdown -> HTML. Order matters: escape first, then code spans (so
// their contents stay literal), then links, bold, escapes, dash policy.
function inline(raw) {
  let s = escapeHtml(raw);
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    const href = LINK_MAP.get(url) ?? url;
    return `<a href="${href}">${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Markdown backslash escapes (e.g. "**bold**\가" separating bold from a
  // Korean particle): the backslash is markup, never content.
  s = s.replace(/\\(?=\S)/g, "");
  // DESIGN.md: no em dashes in user-facing strings. " - " keeps the pause.
  s = s.replaceAll(" — ", " - ").replaceAll("—", "-");
  return s;
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => inline(c.trim()));
  const [head, ...body] = rows.filter((r) => !/^\|[\s:-]+\|?[\s|:-]*$/.test(r));
  const th = cells(head)
    .map((c) => `<th>${c}</th>`)
    .join("");
  const trs = body
    .map((r) => `<tr>${cells(r)
      .map((c) => `<td>${c}</td>`)
      .join("")}</tr>`)
    .join("\n");
  return `<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${trs}\n</tbody>\n</table>`;
}

function mdToBody(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let title = "";
  let meta = "";
  let i = 0;
  let sectionOpen = false;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") {
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      title = trimmed.slice(2).trim();
      i++;
      continue;
    }
    const metaMatch = trimmed.match(/^_(.+)_$/);
    if (metaMatch) {
      meta = inline(metaMatch[1]);
      i++;
      continue;
    }
    if (trimmed === "---") {
      i++;
      continue; // section breaks are expressed by the h2 top border
    }
    if (trimmed.startsWith("## ")) {
      const name = trimmed.slice(3).trim();
      const id = name === "한국어" ? "ko" : name === "English" ? "en" : name.toLowerCase();
      if (sectionOpen) out.push("</section>");
      // The document language is ko; mark the English half so screen readers
      // switch pronunciation rules instead of reading English with Korean ones.
      out.push(`<section id="${id}"${id === "en" ? ' lang="en"' : ""}>`);
      sectionOpen = true;
      out.push(`<h2>${inline(name)}</h2>`);
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      out.push(`<h3>${inline(trimmed.slice(4).trim())}</h3>`);
      i++;
      continue;
    }
    if (trimmed.startsWith("#")) {
      // Unsupported heading depth (#### and beyond). Without this branch the
      // paragraph collector below refuses lines starting with "#", so the
      // outer loop would spin on the same line forever. Per the header
      // contract, anything outside the supported subset fails LOUDLY.
      throw new Error(`unsupported heading depth: "${trimmed.slice(0, 40)}" - extend build-legal-html.mjs`);
    }
    if (trimmed.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim());
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }
    if (trimmed.startsWith("- ")) {
      const items = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(`<li>${inline(lines[i].trim().slice(2))}</li>`);
        i++;
      }
      out.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }
    // Anything else is a paragraph: consecutive plain lines join as one.
    const para = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (
        t === "" ||
        t === "---" ||
        t.startsWith("#") ||
        t.startsWith("|") ||
        t.startsWith("- ")
      ) {
        break;
      }
      para.push(t);
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  if (sectionOpen) out.push("</section>");
  return { title, meta, body: out.join("\n") };
}

// Style adapted from the existing public/legal/privacy/index.html page so the
// flat pages and the earlier landing stay visually consistent. Font stack is
// local-only (no webfont fetch): Pretendard resolves when installed, otherwise
// the system UI font. Zero external requests by construction.
const STYLE = `
  :root{ --bg:#ffffff; --text:#1c1b22; --muted:#55535f; --line:#e7e5ee; --accent:#5b4fc7; }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#16151d; --text:#e9e7f2; --muted:#a6a2b8; --line:#2c2a38; --accent:#a99cf5; }
  }
  *{ box-sizing:border-box }
  html,body{ margin:0; background:var(--bg); color:var(--text);
    font-family:'Pretendard','Pretendard Variable',-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;
    line-height:1.7; -webkit-text-size-adjust:100%; word-break:keep-all; }
  .wrap{ max-width:760px; margin:0 auto; padding:48px 22px 96px; }
  h1{ font-size:26px; font-weight:800; letter-spacing:-.02em; margin:0 0 6px; }
  .meta{ color:var(--muted); font-size:14px; margin:0 0 4px; }
  nav.legal{ margin:14px 0 6px; padding:10px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line);
    font-size:13.5px; color:var(--muted); }
  nav.legal a{ color:var(--accent); text-decoration:none; }
  nav.legal a:hover{ text-decoration:underline; }
  nav.legal .here{ font-weight:700; color:var(--text); }
  nav.legal .sep{ margin:0 7px; color:var(--line); }
  h2{ font-size:17px; font-weight:700; letter-spacing:-.01em; margin:34px 0 10px; padding-top:14px; border-top:1px solid var(--line); }
  h3{ font-size:14.5px; font-weight:700; margin:18px 0 6px; color:var(--text); }
  p,li{ font-size:14.5px; color:var(--text); }
  ul{ margin:8px 0; padding-left:20px; }
  li{ margin:4px 0; }
  strong{ font-weight:700; }
  code{ font-family:ui-monospace,Consolas,monospace; font-size:13px; background:color-mix(in srgb, var(--accent) 8%, transparent);
    padding:1px 5px; border-radius:4px; }
  a{ color:var(--accent); }
  table{ width:100%; border-collapse:collapse; margin:12px 0; font-size:13.5px; }
  th,td{ border:1px solid var(--line); padding:9px 11px; text-align:left; vertical-align:top; }
  th{ background:color-mix(in srgb, var(--accent) 8%, transparent); font-weight:700; }
  footer{ margin-top:44px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:12.5px; }
`;

function navHtml(current) {
  return (
    `<nav class="legal" aria-label="legal documents">` +
    PAGES.map((p) =>
      p.out === current
        ? `<span class="here">${p.nav}</span>`
        : `<a href="./${p.out}">${p.nav}</a>`,
    ).join(`<span class="sep">|</span>`) +
    `</nav>`
  );
}

for (const page of PAGES) {
  const md = readFileSync(join(ROOT, "docs", "legal", page.src), "utf8");
  const { title, meta, body } = mdToBody(md);
  if (!title) throw new Error(`${page.src}: missing h1 title`);
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>2nd-Brain ${escapeHtml(title)}</title>
<meta name="robots" content="index,follow">
<style>${STYLE}</style>
</head>
<body>
<main class="wrap">
<h1>${inline(title)}</h1>
${meta ? `<p class="meta">${meta}</p>` : ""}
${navHtml(page.out)}
${body}
<footer>
이 페이지는 <code>docs/legal/${page.src}</code>에서 생성된 정적 사본입니다. 두 문서의 내용은 항상 같게 유지됩니다.
This page is a static copy generated from the markdown source above; both are kept identical.
</footer>
</main>
</body>
</html>
`;
  const outPath = join(OUT_DIR, page.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log(`wrote ${page.out} -> ${OUT_DIR} (${html.length} bytes)`);
}
