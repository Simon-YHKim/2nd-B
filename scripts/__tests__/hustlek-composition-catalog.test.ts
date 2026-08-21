import { readFileSync } from "node:fs";
import path from "node:path";

type Attachment = {
  role: "accessory" | "badge" | "tool" | "prop";
  slot: string;
  anchor: { x: number; y: number };
  z: number;
  fit_box: [number, number, number, number];
  native128_variant: {
    status: string;
    runtime_scaling_allowed: boolean;
    source_master_resizing_allowed: boolean;
    path?: string;
    decoded_rgba_sha256?: string;
    bbox?: number[];
    atlas_crop?: number[] | null;
  };
};

type Catalog = {
  schema: string;
  counts: Record<string, number | Record<string, number>>;
  contract: {
    anchors: Record<string, { x: number; y: number; z: number; fit_box: number[] }>;
    native_attachment_rule: string;
  };
  parts: {
    hair: { id: string }[];
    acc: { id: string }[];
    face: { id: string }[];
    expr: { id: string }[];
    palettes: { cloth: string[] };
  };
  jobs: { id: string; used_by_avatar_recipe: boolean }[];
  avatars: Array<{
    asset_id: string;
    source_spec: Record<string, unknown>;
    recipe: {
      type: string;
      garment: { source_palette_index: number };
      [key: string]: unknown;
    };
    composable_native128: { status: string; runtime_scaling_allowed: boolean };
    flattened_native128: { atlas_path: string; decoded_rgba_sha256: string };
  }>;
  icons: Array<{
    asset_id: string;
    composition: { standalone: boolean; attachment: Attachment | null };
    standalone_native128: { atlas_path: string; decoded_rgba_sha256: string };
  }>;
  aliases: { id: string; canonical_asset_id: string }[];
};

const file = path.join(
  __dirname,
  "../..",
  "design/hustlek-composition-v1/catalog.json",
);
const catalog = JSON.parse(readFileSync(file, "utf8")) as Catalog;

describe("HustleK composition catalog", () => {
  it("803개 canonical 에셋과 51개 alias를 중복 없이 보존한다", () => {
    expect(catalog.schema).toBe("hustlek-composition-catalog/v1");
    expect(catalog.avatars).toHaveLength(270);
    expect(catalog.icons).toHaveLength(533);
    expect(catalog.aliases).toHaveLength(51);

    const ids = [...catalog.avatars, ...catalog.icons].map((asset) => asset.asset_id);
    expect(new Set(ids).size).toBe(803);
    const iconIds = new Set(catalog.icons.map((icon) => icon.asset_id));
    for (const alias of catalog.aliases) {
      expect(iconIds.has(alias.canonical_asset_id)).toBe(true);
    }
  });

  it("224개 아바타 직업 레시피가 232개 정의 안에서 전부 해석된다", () => {
    const defined = new Set(catalog.jobs.map((job) => job.id));
    const used = new Set(
      catalog.avatars
        .map((avatar) => avatar.source_spec.job)
        .filter((job): job is string => typeof job === "string"),
    );
    expect(defined.size).toBe(232);
    expect(used.size).toBe(224);
    for (const job of used) expect(defined.has(job)).toBe(true);
    expect(catalog.jobs.filter((job) => !job.used_by_avatar_recipe).map((job) => job.id).sort())
      .toEqual([
        "basicChild",
        "basicElder",
        "basicGlasses",
        "basicHat",
        "basicLong",
        "basicNeutral",
        "basicShort",
        "basicSilhouette",
      ]);
  });

  it("18개 의상 팔레트와 끝 인덱스 16·17을 clamp 없이 유지한다", () => {
    expect(catalog.parts.palettes.cloth).toHaveLength(18);
    const indices = new Set(
      catalog.avatars
        .filter((avatar) => avatar.recipe.type === "human")
        .map((avatar) => avatar.recipe.garment.source_palette_index),
    );
    expect(indices.has(16)).toBe(true);
    expect(indices.has(17)).toBe(true);
    for (const avatar of catalog.avatars) {
      expect(avatar.composable_native128.status).toBe("pending_layers");
      expect(avatar.composable_native128.runtime_scaling_allowed).toBe(false);
      expect(avatar.flattened_native128.atlas_path).toMatch(/master-atlas\.png$/);
      expect(avatar.flattened_native128.decoded_rgba_sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("모든 아이콘을 standalone으로 유지하고 허용 목록만 합성 슬롯에 배치한다", () => {
    const validRoles = new Set(["accessory", "badge", "tool", "prop"]);
    const readyPilots: Record<
      string,
      { path: string; bbox: number[]; atlasCrop: number[] | null }
    > = {
      "icons/crown": {
        path: "design/hustlek-composition-v1/pilot/crown-headwear-128.png",
        bbox: [32, 0, 97, 43],
        atlasCrop: null,
      },
      "icons/idBadge": {
        path: "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        bbox: [53, 82, 75, 117],
        atlasCrop: [0, 0, 128, 128],
      },
      "icons/wrench": {
        path: "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        bbox: [83, 75, 108, 123],
        atlasCrop: [128, 0, 128, 128],
      },
      "icons/camera": {
        path: "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        bbox: [78, 76, 121, 109],
        atlasCrop: [256, 0, 128, 128],
      },
    };
    let attachable = 0;
    let pilotReady = 0;
    for (const icon of catalog.icons) {
      expect(icon.composition.standalone).toBe(true);
      expect(icon.standalone_native128.atlas_path).toMatch(/master-atlas\.png$/);
      expect(icon.standalone_native128.decoded_rgba_sha256).toMatch(/^[a-f0-9]{64}$/);
      const attachment = icon.composition.attachment;
      if (!attachment) continue;
      attachable += 1;
      expect(validRoles.has(attachment.role)).toBe(true);
      expect(catalog.contract.anchors[attachment.slot]).toBeDefined();
      const expectedPilot = readyPilots[icon.asset_id];
      if (expectedPilot) {
        pilotReady += 1;
        expect(attachment.native128_variant.status).toBe("pilot_ready");
        expect(attachment.native128_variant.path).toBe(expectedPilot.path);
        expect(attachment.native128_variant.decoded_rgba_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(attachment.native128_variant.bbox).toEqual(expectedPilot.bbox);
        expect(attachment.native128_variant.atlas_crop).toEqual(expectedPilot.atlasCrop);
      } else {
        expect(attachment.native128_variant.status).toBe("pending");
      }
      expect(attachment.native128_variant.runtime_scaling_allowed).toBe(false);
      expect(attachment.native128_variant.source_master_resizing_allowed).toBe(false);
      const [x, y, width, height] = attachment.fit_box;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(128);
      expect(y + height).toBeLessThanOrEqual(128);
    }
    expect(attachable).toBe(267);
    expect(pilotReady).toBe(4);
  });
});
