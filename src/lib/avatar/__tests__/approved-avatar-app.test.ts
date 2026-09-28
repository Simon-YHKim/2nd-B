import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import {
  AVATAR_CATALOG,
  AVATAR_COLORS,
  DEFAULT_AVATAR_SPEC,
  getAnimalFurColors,
  getAvatarThumbnail,
  isAvatarAccessoryOccluded,
  renderAvatarSvg,
  resolveAvatarSpec,
  type AvatarSpec,
  type AvatarThumbnailCategory,
} from "../index";

type Rect = [number, number, number, number, string];
type DesignEngine = {
  ops: (spec: AvatarSpec) => Rect[];
};
type DesignRenderer = {
  render: (rects: Rect[], size: number) => string;
};
type ManifestAsset = {
  group: AvatarThumbnailCategory;
  id: string;
  spec: AvatarSpec;
};
const root = path.resolve(__dirname, "../../../../");
const design = path.join(root, "design/avatar-style-v2");
const manifest = JSON.parse(readFileSync(path.join(design, "manifest.json"), "utf8")) as {
  assets: ManifestAsset[];
};

function loadDesignEngine(): DesignEngine {
  const context = { window: {} as { PXAvatar64?: DesignEngine } };
  vm.runInNewContext(readFileSync(path.join(design, "avatar64.js"), "utf8"), context);
  if (!context.window.PXAvatar64) throw new Error("Approved design generator was not loaded");
  return context.window.PXAvatar64;
}

function loadDesignRenderer(): DesignRenderer {
  const context = {
    window: {},
    module: { exports: {} as DesignRenderer },
  };
  vm.runInNewContext(readFileSync(path.join(design, "approved-style-renderer.js"), "utf8"), context);
  return context.module.exports;
}

const designEngine = loadDesignEngine();
const designRenderer = loadDesignRenderer();
const appEngine = require("../engine.js") as DesignEngine;

test("app generator and treatment bodies stay byte-for-byte in sync with approved design", () => {
  const body = (source: string, start: string, end: string) => {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first);
    if (first < 0 || last < 0) throw new Error("Approved avatar source marker changed");
    return source.slice(first, last);
  };
  const designEngineSource = readFileSync(path.join(design, "avatar64.js"), "utf8");
  const appEngineSource = readFileSync(path.join(root, "src/lib/avatar/engine.js"), "utf8");
  expect(body(appEngineSource, "  var K =", "  return {\n    HAIR:"))
    .toBe(body(designEngineSource, "  var K =", "  root.PXAvatar64 = {"));
  const designRendererSource = readFileSync(path.join(design, "approved-style-renderer.js"), "utf8");
  const appRendererSource = readFileSync(path.join(root, "src/lib/avatar/renderer.js"), "utf8");
  expect(body(appRendererSource, "  var GRID =", "  var api ="))
    .toBe(body(designRendererSource, "  var GRID =", "  var api ="));
});

test("all 144 approved catalog options render with the same app geometry", () => {
  expect(manifest.assets).toHaveLength(144);
  const groups = Object.fromEntries(
    Object.entries(AVATAR_CATALOG).map(([group, items]) => [group, items.length]),
  );
  expect(groups).toEqual({
    hair: 24,
    accessory: 20,
    face: 14,
    expression: 10,
    animal: 26,
    job: 44,
    garment: 6,
  });
  for (const asset of manifest.assets) {
    const spec = resolveAvatarSpec(asset.spec);
    expect(getAvatarThumbnail(asset.group, asset.id)).not.toBeNull();
    expect(JSON.stringify(appEngine.ops(spec))).toBe(JSON.stringify(designEngine.ops(asset.spec)));
  }
});

test("approved glasses, round glasses, animal and wardrobe SVG colors match the design renderer", () => {
  const variants: AvatarSpec[] = [
    DEFAULT_AVATAR_SPEC,
    resolveAvatarSpec({ ...DEFAULT_AVATAR_SPEC, face: "roundglass" }),
    resolveAvatarSpec({ ...DEFAULT_AVATAR_SPEC, type: "animal", species: "cat", fur: "#e8a860" }),
    resolveAvatarSpec({ ...DEFAULT_AVATAR_SPEC, job: "chef", garmentId: "hoodie", cloth2: "#e0a63c" }),
  ];
  for (const spec of variants) {
    const expected = designRenderer.render(designEngine.ops(spec), 128)
      .replace(/ style="[^"]*"/, "")
      .replace(/ aria-hidden="true"/, "");
    expect(renderAvatarSvg(spec, 128)).toBe(expected);
  }
});

test("saved choices are bounded and wardrobe remains independent of job uniforms", () => {
  expect(DEFAULT_AVATAR_SPEC.hair).toBe("sidepart");
  expect(DEFAULT_AVATAR_SPEC.face).toBe("glasses");
  expect(DEFAULT_AVATAR_SPEC.cloth).toBe("#696949");
  expect(AVATAR_COLORS.cloth).toContain("#696949");
  const manual = resolveAvatarSpec({
    ...DEFAULT_AVATAR_SPEC,
    garmentId: "jacket",
    job: "chef",
    wearUniform: true,
  });
  const noUniform = resolveAvatarSpec({ ...manual, wearUniform: false });
  expect(JSON.stringify(appEngine.ops(manual))).toBe(JSON.stringify(appEngine.ops(noUniform)));
  expect(resolveAvatarSpec({ ...manual, job: "teacher" }).garmentId).toBe("jacket");
  expect(resolveAvatarSpec({
    ...manual, hair: "no-such-hair", face: "no-such-face", cloth: "url(js)",
    skin: "#abcdef", garmentId: "unknown", job: "unknown",
  })).toMatchObject({
    hair: "sidepart", face: "glasses", cloth: "#696949",
    skin: "#c98e5e", garmentId: null, job: null,
  });
  expect(getAnimalFurColors("pig")).toContain("#f0b8c4");
  expect(resolveAvatarSpec({ ...manual, type: "animal", species: "pig", fur: "#2b211b" }).fur)
    .toBe("#f0b8c4");
  expect(isAvatarAccessoryOccluded(resolveAvatarSpec({
    ...DEFAULT_AVATAR_SPEC, job: "chef", acc: "headband",
  }))).toBe(true);
  expect(isAvatarAccessoryOccluded(resolveAvatarSpec({
    ...DEFAULT_AVATAR_SPEC, job: "chef", acc: "earrings",
  }))).toBe(false);
});
