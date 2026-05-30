// Cosmic Pixel placeholder asset path helper (A-to-Z Phase 1). The A-to-Z
// structural placeholder bundle is imported under
// public/assets/cosmic-pixel-placeholder-v1/. Runtime references should go
// through these helpers rather than hard-coding the long base path, so a
// future move of the bundle is a one-line change.
//
// Pure + tested. We point at the *extracted* pack folders (not the source
// zips) for runtime SVGs.

export const COSMIC_PLACEHOLDER_BASE = "/assets/cosmic-pixel-placeholder-v1";

/** Path to a file inside an extracted placeholder pack.
 *  e.g. getCosmicAssetPath("2ndB_common_shell_ui_pack_v2", "shell/top_bar_v2.svg") */
export function getCosmicAssetPath(packName: string, relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  return `${COSMIC_PLACEHOLDER_BASE}/asset_packs/extracted/${packName}/${clean}`;
}

/** Path to a master-doc / top-level bundle file (manifests, token css, etc.). */
export function getCosmicDocPath(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  return `${COSMIC_PLACEHOLDER_BASE}/${clean}`;
}
