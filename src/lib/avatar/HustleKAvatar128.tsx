import { Image } from "expo-image";
import React, { memo, useMemo } from "react";
import {
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  HUSTLEK_ATTACHMENT_ATLAS,
  HUSTLEK_ATTACHMENT_ATLAS_HEIGHT,
  HUSTLEK_ATTACHMENT_ATLAS_WIDTH,
  HUSTLEK_ATTACHMENTS,
  HUSTLEK_AVATAR_ATLASES,
  HUSTLEK_AVATAR_ATLAS_HEIGHT,
  HUSTLEK_AVATAR_ATLAS_WIDTH,
  HUSTLEK_AVATAR_IDS,
  HUSTLEK_AVATARS_PER_ATLAS,
  HUSTLEK_AVATARS_PER_ROW,
  HUSTLEK_RUNTIME_CANVAS,
  type HustleKAttachmentAssetId,
  type HustleKAvatarAssetId,
} from "@/lib/avatar/hustlek-runtime-manifest";

export type { HustleKAttachmentAssetId, HustleKAvatarAssetId };

export interface HustleKAvatarComposition {
  /** Supplies base + face, preserving the character's identity. */
  avatarAssetId: HustleKAvatarAssetId;
  /** Supplies garment + hair + headwear + extra. Omit to render the flat original. */
  roleAssetId?: HustleKAvatarAssetId;
  attachmentAssetIds?: readonly HustleKAttachmentAssetId[];
}

export interface HustleKSpriteDescriptor {
  key: string;
  kind: "avatar" | "attachment";
  atlasIndex: number;
  atlasX: number;
  atlasY: number;
  z: number;
  order: number;
}

const PIXELATED = { imageRendering: "pixelated" } as unknown as ImageStyle;
const AVATAR_INDEX = new Map<string, number>(
  HUSTLEK_AVATAR_IDS.map((assetId, index) => [assetId, index]),
);
const LAYER_INDEX = {
  base: 0,
  hair: 1,
  face: 2,
  headwear: 3,
  garment: 4,
  extra: 5,
} as const;

function avatarDescriptor(
  assetId: HustleKAvatarAssetId,
  layerId: keyof typeof LAYER_INDEX,
  z: number,
  order: number,
): HustleKSpriteDescriptor {
  const index = AVATAR_INDEX.get(assetId);
  if (index === undefined) throw new RangeError(`Unknown HustleK avatar asset: ${assetId}`);
  const atlasIndex = Math.floor(index / HUSTLEK_AVATARS_PER_ATLAS);
  const local = index % HUSTLEK_AVATARS_PER_ATLAS;
  const blockX = (local % HUSTLEK_AVATARS_PER_ROW) * 3 * HUSTLEK_RUNTIME_CANVAS;
  const blockY = Math.floor(local / HUSTLEK_AVATARS_PER_ROW) * 2 * HUSTLEK_RUNTIME_CANVAS;
  const layerIndex = LAYER_INDEX[layerId];
  return {
    key: `${layerId}:${assetId}`,
    kind: "avatar",
    atlasIndex,
    atlasX: blockX + (layerIndex % 3) * HUSTLEK_RUNTIME_CANVAS,
    atlasY: blockY + Math.floor(layerIndex / 3) * HUSTLEK_RUNTIME_CANVAS,
    z,
    order,
  };
}

/** Pure resolver used by RN and tests; it never loads or resizes a bitmap. */
export function resolveHustleKSpritePlan(
  composition: HustleKAvatarComposition,
): HustleKSpriteDescriptor[] {
  const base = composition.avatarAssetId;
  const role = composition.roleAssetId ?? base;
  const plan: HustleKSpriteDescriptor[] = [
    avatarDescriptor(base, "base", 30, 0),
    avatarDescriptor(role, "garment", 40, 1),
    avatarDescriptor(role, "hair", 50, 2),
    avatarDescriptor(base, "face", 60, 3),
    avatarDescriptor(role, "headwear", 70, 4),
    avatarDescriptor(role, "extra", 90, 5),
  ];
  for (const [index, assetId] of (composition.attachmentAssetIds ?? []).entries()) {
    const attachment = HUSTLEK_ATTACHMENTS[assetId];
    plan.push({
      key: `attachment:${assetId}:${index}`,
      kind: "attachment",
      atlasIndex: 0,
      atlasX: (attachment.index % 16) * HUSTLEK_RUNTIME_CANVAS,
      atlasY: Math.floor(attachment.index / 16) * HUSTLEK_RUNTIME_CANVAS,
      z: attachment.z,
      order: 100 + index,
    });
  }
  return plan.sort((left, right) => left.z - right.z || left.order - right.order);
}

function SpriteTile({
  descriptor,
  sceneSize,
  sceneLeft,
  sceneTop,
}: {
  descriptor: HustleKSpriteDescriptor;
  sceneSize: number;
  sceneLeft: number;
  sceneTop: number;
}) {
  const avatar = descriptor.kind === "avatar";
  const source = avatar
    ? HUSTLEK_AVATAR_ATLASES[descriptor.atlasIndex]
    : HUSTLEK_ATTACHMENT_ATLAS;
  const atlasWidth = avatar ? HUSTLEK_AVATAR_ATLAS_WIDTH : HUSTLEK_ATTACHMENT_ATLAS_WIDTH;
  const atlasHeight = avatar
    ? HUSTLEK_AVATAR_ATLAS_HEIGHT
    : HUSTLEK_ATTACHMENT_ATLAS_HEIGHT;
  const scale = sceneSize / HUSTLEK_RUNTIME_CANVAS;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.spriteViewport,
        { left: sceneLeft, top: sceneTop, width: sceneSize, height: sceneSize },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={source}
        style={[
          PIXELATED,
          styles.atlas,
          {
            left: -descriptor.atlasX * scale,
            top: -descriptor.atlasY * scale,
            width: atlasWidth * scale,
            height: atlasHeight * scale,
          },
        ]}
        contentFit="fill"
        cachePolicy="memory"
        recyclingKey={`${descriptor.kind}:${descriptor.atlasIndex}:${descriptor.atlasX}:${descriptor.atlasY}`}
      />
    </View>
  );
}

export interface HustleKAvatar128Props {
  composition: HustleKAvatarComposition;
  size?: number;
  crop?: "full" | "head";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Renders pre-authored 128px layers without runtime bitmap scaling between assets.
 * One composition touches at most the base and role avatar atlases plus the optional
 * attachment atlas, avoiding the 34,560px production atlas on Android.
 */
export const HustleKAvatar128 = memo(function HustleKAvatar128({
  composition,
  size = HUSTLEK_RUNTIME_CANVAS,
  crop = "full",
  accessibilityLabel,
  style,
  testID,
}: HustleKAvatar128Props) {
  const plan = useMemo(() => resolveHustleKSpritePlan(composition), [composition]);
  const pixelSize = Math.max(1, Math.round(size));
  const viewport = crop === "head" ? { x: 24, y: 0, size: 80 } : { x: 0, y: 0, size: 128 };
  const scale = pixelSize / viewport.size;
  const sceneSize = HUSTLEK_RUNTIME_CANVAS * scale;
  const sceneLeft = -viewport.x * scale;
  const sceneTop = -viewport.y * scale;

  return (
    <View
      testID={testID}
      style={[styles.root, { width: pixelSize, height: pixelSize }, style]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {plan.map((descriptor) => (
        <SpriteTile
          key={descriptor.key}
          descriptor={descriptor}
          sceneSize={sceneSize}
          sceneLeft={sceneLeft}
          sceneTop={sceneTop}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: "relative", overflow: "hidden" },
  spriteViewport: { position: "absolute", overflow: "hidden" },
  atlas: { position: "absolute" },
});
