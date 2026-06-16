// IDEN serializer — renders an IdenDoc to `.iden` text (the AI-readable half).
//
// Pure: same doc in, same text out. No I/O, no app state. The `.iden` file is
// the data twin of the rendered CV sheet (render-html.ts): one IdenDoc, two
// readers — a human (the A4 sheet) and any AI (this text). See docs/IDEN-SPEC.md §2.
//
// Layout, per spec §2:
//   1. a machine block (YAML frontmatter between `---` fences) the AI parses;
//   2. an optional human-readable prose body under a `# <name> - IDEN` heading;
//   3. the live request, appended LAST behind a `⟦REQUEST⟧` marker.
// (3) honors query-at-end: rules sit up top in the block, the task sits at the
// very bottom. The block is canonical English (spec §1); it carries no binary.
//
// The YAML is hand-emitted in compact flow style (one line per field) so the file
// stays small, diffable, and skimmable. Strings are quoted only when a plain
// scalar would be unsafe or would change type on parse (numbers, bools, dates,
// indicators, colons) — so the output round-trips back to the same structure.

import type { CountMap, IdenDoc, IdenField, IdenSource, NodeGraphData, ScoreMap } from "./types";

/** Marker after which the live task is appended (kept last for query-at-end). */
export const REQUEST_MARK = "⟦REQUEST⟧";

const REQUEST_PLACEHOLDER = "<the actual task the user is handing to the AI>";

export interface SerializeIdenOpts {
  /**
   * The live task handed to the AI, appended last (query-at-end). When omitted,
   * a placeholder is emitted so the file shows where the request goes.
   */
  request?: string;
  /** Optional human prose body, placed under the `# <name> - IDEN` heading. */
  body?: string;
}

// --- YAML scalar emission (context-aware: only quote when a plain scalar is
//     unsafe or would change type on parse) ---

// A plain scalar that matches any of these would parse as a non-string and must
// be quoted to round-trip as text.
const NUMBERISH = /^[+-]?(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const RADIXISH = /^[+-]?0(?:x[0-9a-fA-F_]+|o[0-7_]+|b[01_]+)$/;
const BOOLNULLISH = /^(?:true|false|null|~|yes|no|on|off|none)$/i;
const DATEISH = /^\d{4}-\d{1,2}-\d{1,2}(?:[Tt ].*)?$/;
const TIMEISH = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const INDICATORS = "-?:,[]{}#&*!|>'\"%@`";

function plainSafe(s: string, flow: boolean): boolean {
  if (s.length === 0) return false;
  if (s !== s.trim()) return false; // leading/trailing whitespace
  if (/[\x00-\x1f\x7f]/.test(s)) return false; // control chars (incl. newline)
  if (INDICATORS.includes(s[0])) return false; // an indicator may not start a plain scalar
  if (/:(?:\s|$)/.test(s)) return false; // a colon that opens a mapping
  if (/(?:^|\s)#/.test(s)) return false; // a hash that opens a comment
  if (flow && /[,[\]{}]/.test(s)) return false; // flow-collection delimiters
  if (NUMBERISH.test(s) || RADIXISH.test(s)) return false; // would parse as a number
  if (BOOLNULLISH.test(s)) return false; // would parse as bool/null
  if (DATEISH.test(s) || TIMEISH.test(s)) return false; // ambiguous timestamp across YAML versions
  return true;
}

function quote(s: string): string {
  const body = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return `"${body}"`;
}

/** A string as a YAML scalar — plain when safe, otherwise double-quoted. */
function str(s: string, flow = false): string {
  return plainSafe(s, flow) ? s : quote(s);
}

/** A number as a YAML scalar. Non-finite values degrade to `null` (never faked). */
function num(n: number): string {
  return Number.isFinite(n) ? String(n) : "null";
}

// --- flow-collection builders ---

function flowObj(parts: string[]): string {
  return parts.length > 0 ? `{ ${parts.join(", ")} }` : "{}";
}
function flowSeq(items: string[]): string {
  return items.length > 0 ? `[${items.join(", ")}]` : "[]";
}
function flowNumMap(m: ScoreMap | CountMap): string {
  return flowObj(Object.entries(m).map(([k, v]) => `${str(k, true)}: ${num(v)}`));
}
function flowStrSeq(items: string[]): string {
  return flowSeq(items.map((x) => str(x, true)));
}

function flowSource(src: IdenSource): string {
  const parts = [`kind: ${str(src.kind, true)}`];
  if (src.instrument) parts.push(`instrument: ${str(src.instrument, true)}`);
  return flowObj(parts);
}

function flowNodeGraph(g: NodeGraphData): string {
  return flowObj([`center: ${str(g.center, true)}`, `nodes: ${flowStrSeq(g.nodes)}`]);
}

/** The `data:` value for a field, dispatched by `viz` (matches the union shape). */
function flowData(f: IdenField): string {
  switch (f.viz) {
    case "radar":
    case "bar":
      return flowNumMap(f.data);
    case "donut":
      return flowNumMap(f.data);
    case "node-graph":
      return flowNodeGraph(f.data);
    case "tags":
    case "list":
      return flowStrSeq(f.data);
    case "badge":
      return str(f.data, true);
    case "stat":
      return num(f.data);
    default: {
      const exhaustive: never = f;
      return exhaustive;
    }
  }
}

/** One field as a single-line flow map under the `fields:` sequence. */
function serializeField(f: IdenField): string {
  const parts = [`key: ${str(f.key, true)}`, `label: ${str(f.label, true)}`, `viz: ${str(f.viz, true)}`];
  if (f.placement) parts.push(`placement: ${str(f.placement, true)}`);
  parts.push(`source: ${flowSource(f.source)}`);
  parts.push(`data: ${flowData(f)}`);
  if (f.viz === "donut" && f.topics && f.topics.length > 0) parts.push(`topics: ${flowStrSeq(f.topics)}`);
  if (f.viz === "stat" && f.unit !== undefined) parts.push(`unit: ${str(f.unit, true)}`);
  return `    - ${flowObj(parts)}`;
}

/** A tally of `source.kind` across fields, in first-seen order. */
function provenanceSummary(fields: IdenField[]): string {
  const counts = new Map<string, number>();
  for (const f of fields) counts.set(f.source.kind, (counts.get(f.source.kind) ?? 0) + 1);
  return flowObj([...counts.entries()].map(([k, v]) => `${k}: ${v}`));
}

function machineBlock(doc: IdenDoc): string {
  const lines = [
    "---",
    `iden: ${str(doc.iden)}`,
    `name: ${str(doc.name)}`,
    `generated: ${str(doc.generated)}`,
    `provenance_summary: ${provenanceSummary(doc.fields)}`,
    "identity:",
    `  one_liner: ${str(doc.oneLiner)}`,
    "  fields:",
    ...doc.fields.map(serializeField),
  ];
  if (doc.summary) {
    lines.push("summary:", `  text: ${str(doc.summary.text)}`, `  source: ${flowSource(doc.summary.source)}`);
  }
  if (doc.rules && doc.rules.length > 0) {
    lines.push("rules:", ...doc.rules.map((r) => `  - ${str(r)}`));
  }
  lines.push("---");
  return lines.join("\n");
}

// Keep the human heading + one-liner on single lines (the machine block already
// carries the exact values; this is prose).
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Serialize an IdenDoc to `.iden` text: machine block, prose body, request last. */
export function serializeIden(doc: IdenDoc, opts: SerializeIdenOpts = {}): string {
  const body = [`# ${oneLine(doc.name)} - IDEN`, "", oneLine(doc.oneLiner)];
  const extra = opts.body?.trim();
  if (extra) body.push("", extra);

  const request = opts.request?.trim() || REQUEST_PLACEHOLDER;

  return [machineBlock(doc), "", ...body, "", REQUEST_MARK, request].join("\n") + "\n";
}
