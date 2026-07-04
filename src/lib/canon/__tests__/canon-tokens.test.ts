// Drift guard for the generated design-token mirror (tokens.json ← m3-theme.css).
// Values are the documented rev2 defaults (design/proto_rev2/README.md §Design Tokens).

import { canonTokens } from "../index";

describe("canon design-token mirror", () => {
  it("carries all 4 palette sets", () => {
    expect(Object.keys(canonTokens.palettes).sort()).toEqual([
      "cyan-dark",
      "cyan-light",
      "violet-dark",
      "violet-light",
    ]);
  });

  it("pins the cyan-dark default scheme anchors", () => {
    const cd = canonTokens.palettes["cyan-dark"];
    expect(cd["--md-sys-color-primary"]).toBe("#86CFFF");
    expect(cd["--md-sys-color-surface"]).toBe("#0B0F14");
    expect(cd["--md-sys-color-outline-variant"]).toBe("#41484D");
  });

  it("pins the palette-independent deep-space accents", () => {
    expect(canonTokens.root["--sb-star"]).toBe("#CCFAFF");
    expect(canonTokens.root["--sb-star-core"]).toBe("#46B6FF");
    expect(canonTokens.root["--sb-polaris"]).toBe("#C8B6FF");
  });
});
