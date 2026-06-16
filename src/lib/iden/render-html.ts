// IDEN viewer — renders an IdenDoc to a self-contained A4 two-column CV sheet.
//
// Pure: same doc in, same HTML string out. No I/O, no app state. The output is
// a standalone HTML document (inline CSS + inline SVG, one webfont link) meant
// for print (Ctrl/Cmd+P -> clean A4 one-pager), PDF export, or a WebView.
//
// Design is locked to docs/iden-mocks/iden-E-twocol.html and docs/IDEN-SPEC.md:
// white-ish paper, a single accent, thin rules, charts-carry-meaning. Colors are
// sourced only from theme tokens (no new hex); translucency uses SVG fill-opacity.
// Schema-driven: fields render by `viz`; unknown shapes fall back to tags/badge.

import { cosmic, lightCosmic } from "../theme/tokens";
import type { CountMap, IdenDoc, IdenField, NodeGraphData, ScoreMap, IdenSource } from "./types";

type Locale = "en" | "ko";

export interface RenderIdenOpts {
  locale?: Locale;
}

// --- palette (tokens only; one darkened violet token = print accent) ---
const P = {
  paper: lightCosmic.bg, // Moon Haze, faint violet-tinted (never pure white)
  rail: lightCosmic.surface, // soul-violet wash
  ink: lightCosmic.text,
  body: lightCosmic.textMuted,
  muted: lightCosmic.textSubtle,
  line: lightCosmic.border,
  track: lightCosmic.surface,
  accent: cosmic.soulViolet2, // #7C5EE8, AA-safe enough for fills/strokes on light
  cores: {
    Soul: cosmic.soulViolet2,
    Growth: cosmic.signalBlue,
    Wisdom: cosmic.signalMint,
    Bond: cosmic.pixelLamp,
    Muse: cosmic.dreamPink,
    Record: cosmic.mistGray,
  } as Record<string, string>,
  donutGrey: [cosmic.mistGray, lightCosmic.border] as const,
};

const CORE_PALETTE = [cosmic.signalBlue, cosmic.signalMint, cosmic.pixelLamp, cosmic.dreamPink, cosmic.mistGray];

const T = {
  en: {
    summaryLabel: "AI-generated interpretation",
    profile: "Profile",
    items: (n: number) => `${n} items`,
    measured: "measured",
    assessment: "assessment",
    selfReport: "self-report",
    derived: "derived",
    collecting: "collecting",
  },
  ko: {
    summaryLabel: "AI 해석",
    profile: "프로필",
    items: (n: number) => `${n}개 항목`,
    measured: "측정",
    assessment: "평가",
    selfReport: "자기보고",
    derived: "산출",
    collecting: "수집 중",
  },
} as const;

// --- small helpers ---
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
function pct(n: number): number {
  return Math.round(clamp01(n) * 100);
}
function coreColor(name: string, i: number): string {
  return P.cores[name] ?? CORE_PALETTE[i % CORE_PALETTE.length];
}

/** Honest source label. `count` renders nothing (the number is its own evidence). */
function sourceText(src: IdenSource, t: (typeof T)[Locale]): string {
  switch (src.kind) {
    case "measured":
      return src.instrument ? `${t.measured} · ${src.instrument}` : t.measured;
    case "instrument":
      return src.instrument ?? t.measured;
    case "assessment":
      return t.assessment;
    case "self_report":
      return t.selfReport;
    case "derived":
      return t.derived;
    case "ai_summary":
      return t.summaryLabel;
    case "collecting":
      return t.collecting;
    case "count":
    default:
      return "";
  }
}
function srcTag(src: IdenSource, t: (typeof T)[Locale]): string {
  const text = sourceText(src, t);
  return text ? ` <span class="src">${esc(text)}</span>` : "";
}

// --- SVG / HTML builders ---
function radarSvg(scores: ScoreMap): string {
  const keys = Object.keys(scores);
  const n = keys.length || 1;
  // Wide viewBox (240) with a centered cx (120) leaves room for full trait names
  // (e.g. "Conscientiousness") to render without clipping the right/left edge.
  const cx = 120;
  const cy = 98;
  const R = 66;
  const pt = (i: number, r: number): [number, number] => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (r: number) => keys.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");
  const axes = keys
    .map((_, i) => {
      const [x, y] = pt(i, R);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    })
    .join("");
  const dpts = keys.map((k, i) => pt(i, R * clamp01(scores[k])).map((v) => v.toFixed(1)).join(",")).join(" ");
  const dots = keys
    .map((k, i) => {
      const [x, y] = pt(i, R * clamp01(scores[k]));
      return `<circle class="vtx" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.1"><title>${esc(k)} ${pct(scores[k])}</title></circle>`;
    })
    .join("");
  // Full trait names (no lossy abbreviation), each with a hover title carrying
  // name + value. Long names anchor at middle so they stay inside the viewBox;
  // short ones hug their side. The chart's accessible name (below) enumerates
  // every axis + value, so the names reach assistive tech in full.
  const labels = keys
    .map((k, i) => {
      const [x, y] = pt(i, R + 13);
      const anchor = k.length > 10 ? "middle" : x < cx - 4 ? "end" : x > cx + 4 ? "start" : "middle";
      return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}"><title>${esc(k)} ${pct(scores[k])}</title>${esc(k)}</text>`;
    })
    .join("");
  const desc = `Traits radar. ${keys.map((k) => `${k} ${pct(scores[k])}`).join(", ")}.`;
  return `<svg viewBox="0 0 240 196" width="100%" role="img" aria-label="${esc(desc)}"><title>${esc(desc)}</title><polygon class="grid" points="${poly(R)}"/><polygon class="grid" points="${poly(R * 0.5)}"/><g class="axis">${axes}</g><polygon class="data" points="${dpts}"/><g>${dots}</g><g class="rlabel">${labels}</g></svg>`;
}

function barsHtml(scores: ScoreMap): string {
  return Object.entries(scores)
    .map(([k, v]) => {
      const p = pct(v);
      return `<div class="bar"><span class="k">${esc(k)}</span><div class="track"><div class="fill" style="width:${p}%"></div></div><span class="n">${p}</span></div>`;
    })
    .join("");
}

function donutSvg(counts: CountMap): string {
  const entries = Object.entries(counts);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const r = 27;
  const C = 2 * Math.PI * r;
  const palette = [P.accent, P.donutGrey[0], P.donutGrey[1], cosmic.signalBlue, cosmic.signalMint];
  let off = 0;
  const segs = entries
    .map(([, v], i) => {
      const len = (v / total) * C;
      const s = `<circle class="seg" cx="40" cy="40" r="${r}" stroke="${palette[i % palette.length]}" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}"/>`;
      off += len;
      return s;
    })
    .join("");
  return `<svg viewBox="0 0 80 80" width="92" role="img" aria-label="Contents composition"><g transform="rotate(-90 40 40)">${segs}</g><text x="40" y="44" text-anchor="middle" class="dtotal">${total}</text></svg>`;
}

function donutLegend(counts: CountMap): string {
  const entries = Object.entries(counts);
  const palette = [P.accent, P.donutGrey[0], P.donutGrey[1], cosmic.signalBlue, cosmic.signalMint];
  const rows = entries
    .map(([k, v], i) => `<div><span class="sw" style="background:${palette[i % palette.length]}"></span>${esc(k)} <span class="nn">${v}</span></div>`)
    .join("");
  return `<div class="leg">${rows}</div>`;
}

function nodeGraphSvg(g: NodeGraphData): string {
  const cx = 75;
  const cy = 66;
  const R = 44;
  const n = g.nodes.length || 1;
  const pt = (i: number): [number, number] => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  const links = g.nodes
    .map((_, i) => {
      const [x, y] = pt(i);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    })
    .join("");
  const dots = g.nodes
    .map((nm, i) => {
      const [x, y] = pt(i);
      return `<circle class="node" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${coreColor(nm, i)}"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 150 132" width="100%" role="img" aria-label="Pattern cores"><g class="link">${links}</g>${dots}<circle class="node" cx="${cx}" cy="${cy}" r="11" fill="${P.accent}"/></svg>`;
}

function coreLegend(g: NodeGraphData): string {
  const items = [g.center, ...g.nodes]
    .map((nm, i) => `<span><span class="dot" style="background:${nm === g.center ? P.accent : coreColor(nm, i - 1)}"></span>${esc(nm)}</span>`)
    .join("");
  return `<div class="corelist">${items}</div>`;
}

function tagsInline(arr: string[]): string {
  return arr.map((x) => esc(x)).join(' <span class="sep">·</span> ');
}

// --- column dispatch ---
function columns(f: IdenField): ("rail" | "main")[] {
  const p = f.placement ?? (f.viz === "radar" || f.viz === "node-graph" ? "rail" : "main");
  return p === "both" ? ["rail", "main"] : [p];
}
const inRail = (f: IdenField) => columns(f).includes("rail");
const inMain = (f: IdenField) => columns(f).includes("main");

function railBlock(label: string, body: string, note: string): string {
  const noteHtml = note ? `<span class="rb-note">${esc(note)}</span>` : "";
  return `<div class="rblock"><div class="rb-h">${esc(label)}${noteHtml}</div>${body}</div>`;
}

function railField(f: IdenField, t: (typeof T)[Locale]): string {
  const note = sourceText(f.source, t);
  switch (f.viz) {
    case "radar":
    case "bar":
      return railBlock(f.label, radarSvg(f.data), note);
    case "node-graph":
      return railBlock(f.label, nodeGraphSvg(f.data) + coreLegend(f.data), note);
    case "list":
      return railBlock(f.label, `<div class="stack">${f.data.map((x) => esc(x)).join("<br>")}</div>`, note);
    case "tags":
      return railBlock(f.label, `<div class="rtags">${tagsInline(f.data)}</div>`, note);
    case "badge":
      return railBlock(f.label, `<div class="rbadge">${esc(f.data)}</div>`, note);
    default:
      return "";
  }
}

function section(label: string, note: string, body: string): string {
  const noteHtml = note ? `<span class="note">${esc(note)}</span>` : "";
  return `<section><div class="h"><h2>${esc(label)}</h2>${noteHtml}</div>${body}</section>`;
}

function renderMain(doc: IdenDoc, t: (typeof T)[Locale]): string {
  const out: string[] = [];

  if (doc.summary) {
    out.push(section("Summary", sourceText(doc.summary.source, t), `<p class="summary">${esc(doc.summary.text)}</p>`));
  }

  const main = doc.fields.filter(inMain);

  // scores -> bars section (one per field, two-representation with the rail radar)
  for (const f of main) {
    if (f.viz === "radar" || f.viz === "bar") {
      out.push(section(f.label, sourceText(f.source, t), barsHtml(f.data)));
    }
  }

  // badge / tags / list -> grouped Profile rows
  const profile = main.filter((f) => f.viz === "badge" || f.viz === "tags" || f.viz === "list");
  if (profile.length > 0) {
    const rows = profile
      .map((f) => {
        let value: string;
        if (f.viz === "badge") value = esc(f.data);
        else if (f.viz === "tags" || f.viz === "list") value = tagsInline(f.data);
        else return "";
        return `<div class="row"><span class="k">${esc(f.label)}</span><span class="v">${value}${srcTag(f.source, t)}</span></div>`;
      })
      .join("");
    out.push(section(t.profile, "", rows));
  }

  // donut / stat -> own section
  for (const f of main) {
    if (f.viz === "donut") {
      out.push(section(f.label, t.items(Object.values(f.data).reduce((a, v) => a + v, 0)), `<div class="donutwrap">${donutSvg(f.data)}${donutLegend(f.data)}</div>`));
    } else if (f.viz === "stat") {
      out.push(section(f.label, sourceText(f.source, t), `<div class="bigstat">${f.data}${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ""}</div>`));
    }
  }

  return out.join("");
}

const MARK_SVG = `<svg class="mark" width="40" height="40" viewBox="0 0 60 60" aria-hidden="true"><g class="link"><line x1="30" y1="30" x2="30" y2="12"/><line x1="30" y1="30" x2="46" y2="23"/><line x1="30" y1="30" x2="40" y2="46"/><line x1="30" y1="30" x2="20" y2="46"/><line x1="30" y1="30" x2="14" y2="23"/></g><circle cx="30" cy="12" r="2.6"/><circle cx="46" cy="23" r="2.6"/><circle cx="40" cy="46" r="2.6"/><circle cx="20" cy="46" r="2.6"/><circle cx="14" cy="23" r="2.6"/><circle cx="30" cy="30" r="6"/></svg>`;

function css(): string {
  return `
  *{box-sizing:border-box} html,body{margin:0}
  body{background:#e9e8ee;color:${P.body};font-family:Pretendard,system-ui,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased;padding:28px 14px}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:${P.paper};box-shadow:0 1px 24px rgba(13,21,48,.12);display:grid;grid-template-columns:66mm 1fr}
  .rail{background:${P.rail};border-right:1px solid ${P.line};padding:18mm 12mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .main{padding:18mm 16mm}
  .mark{display:block;margin-bottom:14px}
  .mark .link line{stroke:${P.line};stroke-width:1.4} .mark circle{fill:${P.accent}}
  .name{font-size:24px;font-weight:800;color:${P.ink};letter-spacing:-.01em;line-height:1.1}
  .role{font-size:12px;color:${P.muted};margin-top:4px}
  .ver{display:inline-block;margin-top:12px;font-size:9.5px;letter-spacing:.18em;color:${P.muted};text-transform:uppercase;border:1px solid ${P.line};border-radius:3px;padding:3px 7px}
  .rblock{margin-top:22px}
  .rb-h{display:flex;justify-content:space-between;align-items:baseline;font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${P.ink};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${P.line}}
  .rb-note{font-size:9px;font-weight:500;letter-spacing:.04em;color:${P.muted}}
  .stack{font-size:12.5px;color:${P.ink};line-height:1.8} .rtags,.rbadge{font-size:12.5px;color:${P.ink}}
  .corelist{display:flex;flex-direction:column;gap:6px;font-size:12px;color:${P.ink}}
  .corelist span{display:flex;align-items:center;gap:8px}
  .dot{width:8px;height:8px;border-radius:50%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  section{padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid ${P.line}}
  section:last-child{border-bottom:none;margin-bottom:0}
  .h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:11px}
  .h h2{font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${P.ink};margin:0}
  .h .note{font-size:10px;color:${P.muted};letter-spacing:.06em;text-transform:uppercase}
  .summary{font-size:13.5px;color:${P.body};margin:0}
  .bar{display:grid;grid-template-columns:140px 1fr 30px;gap:14px;align-items:center;padding:4px 0;font-size:12.5px}
  .bar .k{color:${P.ink}} .track{height:6px;background:${P.track}}
  .fill{height:100%;background:${P.accent};-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bar .n{font-size:11.5px;color:${P.muted};text-align:right;font-variant-numeric:tabular-nums}
  .row{display:grid;grid-template-columns:120px 1fr;gap:14px;padding:5px 0;font-size:13px;align-items:baseline}
  .row .k{color:${P.muted};font-size:11px;letter-spacing:.06em;text-transform:uppercase}
  .row .v{color:${P.ink}} .src{color:${P.muted};font-size:10.5px;margin-left:7px;text-transform:uppercase;letter-spacing:.04em}
  .sep{color:${P.muted}} .bigstat{font-size:30px;font-weight:800;color:${P.ink}} .bigstat .unit{font-size:13px;color:${P.muted};margin-left:6px}
  .donutwrap{display:grid;grid-template-columns:92px 1fr;gap:22px;align-items:center}
  .leg{font-size:12.5px} .leg div{display:flex;align-items:center;gap:9px;padding:3px 0}
  .leg .sw{width:9px;height:9px;border-radius:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .leg .nn{margin-left:auto;color:${P.muted};font-variant-numeric:tabular-nums}
  svg .grid{stroke:${P.line};fill:none} svg .axis{stroke:${P.line}}
  svg .data{fill:${P.accent};fill-opacity:.14;stroke:${P.accent};stroke-width:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  svg .vtx{fill:${P.accent}} svg .rlabel text{fill:${P.muted};font-size:7px}
  svg .link line{stroke:${P.line};stroke-width:1.3} svg .node{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  svg .seg{fill:none;stroke-width:13;-webkit-print-color-adjust:exact;print-color-adjust:exact} svg .dtotal{fill:${P.ink};font-size:13px;font-weight:700}
  footer{margin-top:18px;padding-top:12px;border-top:1px solid ${P.line};font-size:10px;color:${P.muted}}
  @page{size:A4;margin:0}
  @media print{body{background:#fff;padding:0}.page{width:auto;min-height:auto;margin:0;box-shadow:none}}`;
}

/** Render an IdenDoc to a self-contained A4 CV-sheet HTML document. */
export function renderIdenHtml(doc: IdenDoc, opts: RenderIdenOpts = {}): string {
  const locale: Locale = opts.locale ?? "en";
  const t = T[locale];

  const rail = doc.fields.filter(inRail).map((f) => railField(f, t)).join("");
  const main = renderMain(doc, t);

  const provSummary = doc.fields.length;
  const measured = doc.fields.filter((f) => f.source.kind === "measured" || f.source.kind === "instrument").length;

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IDEN - ${esc(doc.name)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${css()}</style>
</head>
<body>
<div class="page">
  <aside class="rail">
    ${MARK_SVG}
    <div class="name">${esc(doc.name)}</div>
    <div class="role">${esc(doc.oneLiner)}</div>
    <span class="ver">IDEN ${esc(doc.iden)}</span>
    ${rail}
  </aside>
  <main class="main">
    ${main}
    <footer>IDEN ${esc(doc.iden)} · generated ${esc(doc.generated)} · ${measured} measured / ${provSummary - measured} other · machine block in source .iden</footer>
  </main>
</div>
</body>
</html>`;
}
