import { readFileSync } from "node:fs";
import path from "node:path";

jest.mock("expo-image", () => ({ __esModule: true, Image: () => null }));
jest.mock("react-native", () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: () => null,
}));

import {
  resolveHustleKSpritePlan,
  type HustleKAttachmentAssetId,
  type HustleKAvatarAssetId,
} from "@/lib/avatar/HustleKAvatar128";
import {
  HUSTLEK_ATTACHMENT_ATLAS_HEIGHT,
  HUSTLEK_ATTACHMENT_ATLAS_WIDTH,
  HUSTLEK_ATTACHMENTS,
  HUSTLEK_AVATAR_ATLASES,
  HUSTLEK_AVATAR_ATLAS_HEIGHT,
  HUSTLEK_AVATAR_ATLAS_WIDTH,
  HUSTLEK_AVATAR_IDS,
} from "@/lib/avatar/hustlek-runtime-manifest";

const plain = "avatars/presets/plain" as const satisfies HustleKAvatarAssetId;
const wizard = "avatars/fantasy/wizard" as const satisfies HustleKAvatarAssetId;

describe("HustleKAvatar128 runtime composition", () => {
  test("270개 아바타와 267개 부착 에셋을 Android-safe atlas로 고정한다", () => {
    expect(HUSTLEK_AVATAR_IDS).toHaveLength(270);
    expect(HUSTLEK_AVATAR_ATLASES).toHaveLength(7);
    expect(Object.keys(HUSTLEK_ATTACHMENTS)).toHaveLength(267);
    expect([...HUSTLEK_AVATAR_IDS]).toEqual([...HUSTLEK_AVATAR_IDS].sort());
  });

  test("기본 캐릭터의 base·face와 역할 donor의 외형 레이어를 분리한다", () => {
    const plan = resolveHustleKSpritePlan({ avatarAssetId: plain, roleAssetId: wizard });
    expect(plan.map((sprite) => sprite.key)).toEqual([
      `base:${plain}`,
      `garment:${wizard}`,
      `hair:${wizard}`,
      `face:${plain}`,
      `headwear:${wizard}`,
      `extra:${wizard}`,
    ]);
    expect(plan.map((sprite) => sprite.z)).toEqual([30, 40, 50, 60, 70, 90]);
  });

  test("back·headwear·hand attachment를 z 순서로 합성한다", () => {
    const plan = resolveHustleKSpritePlan({
      avatarAssetId: plain,
      attachmentAssetIds: ["icons/wrench", "icons/crown", "icons/backpack"],
    });
    expect(plan.map((sprite) => sprite.z)).toEqual([10, 30, 40, 50, 60, 70, 70, 80, 90]);
    expect(plan[0].key).toContain("icons/backpack");
    expect(plan.findIndex((sprite) => sprite.key.includes("icons/crown"))).toBeGreaterThan(
      plan.findIndex((sprite) => sprite.key.startsWith("headwear:")),
    );
  });

  test("모든 avatar tile이 1920×2048 runtime atlas 경계 안에 있다", () => {
    for (const avatarAssetId of HUSTLEK_AVATAR_IDS) {
      const plan = resolveHustleKSpritePlan({ avatarAssetId });
      for (const sprite of plan) {
        expect(sprite.kind).toBe("avatar");
        expect(sprite.atlasIndex).toBeGreaterThanOrEqual(0);
        expect(sprite.atlasIndex).toBeLessThan(HUSTLEK_AVATAR_ATLASES.length);
        expect(sprite.atlasX).toBeGreaterThanOrEqual(0);
        expect(sprite.atlasY).toBeGreaterThanOrEqual(0);
        expect(sprite.atlasX + 128).toBeLessThanOrEqual(HUSTLEK_AVATAR_ATLAS_WIDTH);
        expect(sprite.atlasY + 128).toBeLessThanOrEqual(HUSTLEK_AVATAR_ATLAS_HEIGHT);
      }
    }
  });

  test("모든 attachment tile이 단일 2048×2176 atlas 경계 안에 있다", () => {
    for (const assetId of Object.keys(HUSTLEK_ATTACHMENTS) as HustleKAttachmentAssetId[]) {
      const descriptor = resolveHustleKSpritePlan({
        avatarAssetId: plain,
        attachmentAssetIds: [assetId],
      }).find((sprite) => sprite.kind === "attachment");
      expect(descriptor).toBeDefined();
      expect(descriptor!.atlasX + 128).toBeLessThanOrEqual(HUSTLEK_ATTACHMENT_ATLAS_WIDTH);
      expect(descriptor!.atlasY + 128).toBeLessThanOrEqual(HUSTLEK_ATTACHMENT_ATLAS_HEIGHT);
    }
  });

  test("기존 Avatar64가 nativeComposition 입력을 명시적으로 위임한다", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/avatar/Avatar64.tsx"),
      "utf8",
    );
    expect(source).toContain("nativeComposition?: HustleKAvatarComposition");
    expect(source).toContain("if (nativeComposition)");
    expect(source).toContain('require("@/lib/avatar/HustleKAvatar128")');
    expect(source).toContain("<NativeAvatar");
  });
});
