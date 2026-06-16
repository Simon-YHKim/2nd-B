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

export interface IdenExport {
  /** The portable `.iden` text (machine block + body + request placeholder). */
  iden: string;
  /** The standalone A4 CV-sheet HTML (Ctrl/Cmd+P -> PDF, or a WebView). */
  html: string;
  /** Slug + date stem for downloads, e.g. "simon-iden-2026-06-16". */
  filenameBase: string;
  idenFilename: string;
  htmlFilename: string;
  locale: "en" | "ko";
  /** Character lengths (consistent with context-pack's char-based sizing). */
  chars: { iden: number; html: number };
}

export interface BuildIdenExportOpts extends RenderIdenOpts {
  /** Live task appended last in the `.iden` (query-at-end); placeholder if absent. */
  request?: string;
  /** Optional human prose body for the `.iden`. */
  body?: string;
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

/** Bundle an IdenDoc into its two shareable artifacts + a download stem. Pure. */
export function buildIdenExport(doc: IdenDoc, opts: BuildIdenExportOpts = {}): IdenExport {
  const locale = opts.locale ?? "en";
  const iden = serializeIden(doc, { request: opts.request, body: opts.body });
  const html = renderIdenHtml(doc, { locale });
  const slug = slugify(doc.name);
  const filenameBase = `${slug ? `${slug}-` : ""}iden-${doc.generated}`;
  return {
    iden,
    html,
    filenameBase,
    idenFilename: `${filenameBase}.iden`,
    htmlFilename: `${filenameBase}.html`,
    locale,
    chars: { iden: iden.length, html: html.length },
  };
}

export interface ExportIdenOpts extends BuildIdenExportOpts, BuildIdenOpts {}

/** Fetch the user's IdenDoc and bundle its export artifacts. Thin fetcher. */
export async function exportIden(userId: string, opts: ExportIdenOpts = {}): Promise<IdenExport> {
  const doc = await buildIdenDoc(userId, opts);
  return buildIdenExport(doc, opts);
}
