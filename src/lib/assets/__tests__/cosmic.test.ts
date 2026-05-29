import { getCosmicAssetPath, getCosmicDocPath, COSMIC_PLACEHOLDER_BASE } from "../cosmic";

describe("cosmic placeholder asset paths", () => {
  it("builds an extracted-pack path", () => {
    expect(getCosmicAssetPath("2ndB_common_shell_ui_pack_v2", "shell/top_bar_v2.svg")).toBe(
      `${COSMIC_PLACEHOLDER_BASE}/asset_packs/extracted/2ndB_common_shell_ui_pack_v2/shell/top_bar_v2.svg`,
    );
  });

  it("tolerates a leading slash on the relative path", () => {
    expect(getCosmicAssetPath("pack", "/a/b.svg")).toBe(
      `${COSMIC_PLACEHOLDER_BASE}/asset_packs/extracted/pack/a/b.svg`,
    );
  });

  it("builds a doc path", () => {
    expect(getCosmicDocPath("master_docs/cosmic-pixel-placeholder-tokens.css")).toBe(
      `${COSMIC_PLACEHOLDER_BASE}/master_docs/cosmic-pixel-placeholder-tokens.css`,
    );
  });
});
