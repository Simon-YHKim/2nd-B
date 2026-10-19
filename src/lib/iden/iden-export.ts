// IDEN export bundler (queue C, device-independent core).
//
// One IdenDoc -> the two shareable artifacts a viewer/export flow needs:
//   - `.iden` text (serialize.ts)   — the AI-readable data twin.
//   - standalone A4 HTML (render-html.ts) — print to PDF, or load in a WebView.
// plus a download-friendly filename stem.
//
// Pure + tested. The actual screen wiring (an export button on /wiki or /data, a
// WebView preview, native file download / PDF share) is intentionally NOT here:
// per ANDROID_QA_GUIDELINES.md (WebView + SVG render locks, lifecycle), that step
// needs a device-QA pass. This builder is the seam that UI calls once that lands.

import { renderIdenHtml, type RenderIdenOpts } from "./render-html";
import { serializeIden } from "./serialize";
import { buildIdenDoc, type BuildIdenOpts } from "./build-iden";
import type { IdenDoc } from "./types";
import { withAiCopyTail } from "../chat/ai-mark";

export interface IdenExport {
  /** The portable `.iden` text (machine block + body + request placeholder). */
  iden: string;
  /** The standalone A4 CV-sheet HTML (Ctrl/Cmd+P -> PDF, or a WebView). */
  html: string;
  /** The filtered IdenDoc as pretty JSON — the machine-interchange form (P5a). */
  json: string;
  /** Slug + date stem for downloads, e.g. "simon-iden-2026-06-16". */
  filenameBase: string;
  idenFilename: string;
  htmlFilename: string;
  jsonFilename: string;
  locale: "en" | "ko";
  /** Character lengths (consistent with context-pack's char-based sizing). */
  chars: { iden: number; html: number; json: number };
}

export interface BuildIdenExportOpts extends RenderIdenOpts {
  /** Localized secondb:aiCopyTail for model text leaving the app. */
  aiCopyTail?: string;
  /** Live task appended last in the `.iden` (query-at-end); placeholder if absent. */
  request?: string;
  /** Optional human prose body for the `.iden`. */
  body?: string;
  /**
   * Data sovereignty toggles (rev2 P5a): field keys to KEEP in every artifact
   * (.iden / HTML / JSON). Undefined = all fields. An excluded field never
   * leaves the device in any format.
   */
  include?: readonly string[];
}

/** Label model summaries and attributed northstar sentences before serialization,
 *  keeping JSON/YAML parseable and HTML escaped without changing stored text. */
export function withIdenAiCopyTail(doc: IdenDoc, tail: string | undefined): IdenDoc {
  if (!tail) return doc;
  const summary = doc.summary?.text.trim() && doc.summary.source.kind === "ai_summary"
    ? { ...doc.summary, text: withAiCopyTail(doc.summary.text, tail) } : doc.summary;
  const oneLiner = doc.oneLinerAiSuggested && doc.oneLiner.trim()
    ? withAiCopyTail(doc.oneLiner, tail) : doc.oneLiner;
  if (summary === doc.summary && oneLiner === doc.oneLiner) return doc;
  return { ...doc, oneLiner, ...(summary ? { summary } : {}) };
}

/** ASCII slug for a filename; empty when nothing survives (e.g. Hangul). Capped
 *  so the final filename stays within filesystem limits. Not collision-safe (no
 *  per-user discriminator) — fine for a single personal export. */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 60).replace(/-+$/, "");
}

/** Bundle an IdenDoc into its shareable artifacts + a download stem. Pure. */
export function buildIdenExport(doc: IdenDoc, opts: BuildIdenExportOpts = {}): IdenExport {
  const locale = opts.locale ?? "en";
  const labelled = withIdenAiCopyTail(doc, opts.aiCopyTail);
  // Sovereignty filter first (P5a): every artifact renders from the SAME
  // filtered doc, so an excluded field cannot leak through any format.
  const kept: IdenDoc = opts.include
    ? { ...labelled, fields: labelled.fields.filter((f) => opts.include!.includes(f.key)) }
    : labelled;
  const iden = serializeIden(kept, { request: opts.request, body: opts.body });
  const html = renderIdenHtml(kept, { locale });
  const json = JSON.stringify(kept, null, 2);
  const slug = slugify(doc.name);
  const filenameBase = `${slug ? `${slug}-` : ""}iden-${doc.generated}`;
  return {
    iden,
    html,
    json,
    filenameBase,
    idenFilename: `${filenameBase}.iden`,
    htmlFilename: `${filenameBase}.html`,
    jsonFilename: `${filenameBase}.json`,
    locale,
    chars: { iden: iden.length, html: html.length, json: json.length },
  };
}

export interface ExportIdenOpts extends BuildIdenExportOpts, BuildIdenOpts {}

/** Fetch the user's IdenDoc and bundle its export artifacts. Thin fetcher. `opts.minor`
 *  is required (BuildIdenOpts): the persona build behind it is crisis-capable (C10). */
export async function exportIden(userId: string, opts: ExportIdenOpts): Promise<IdenExport> {
  const doc = await buildIdenDoc(userId, opts);
  return buildIdenExport(doc, opts);
}
