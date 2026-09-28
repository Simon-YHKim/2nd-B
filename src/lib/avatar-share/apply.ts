import { DEFAULT_AVATAR_SPEC, type AvatarSharedOverlay, type AvatarSpec } from "@/lib/avatar";
import { fetchAvatarSpec, saveAvatarSpec } from "@/lib/supabase/avatar-spec";
import { fetchAvatarShareAsset, type AvatarShareAsset } from "./api";
import { type AvatarShareSlot } from "./pixels";

const DISPLAY_ORDER: readonly AvatarShareSlot[] = ["garment", "hair", "accessory"];

/** Resolve only art still approved and visible to this viewer. */
export async function loadAvatarShareOverlays(spec: AvatarSpec): Promise<AvatarSharedOverlay[]> {
  const references = DISPLAY_ORDER.flatMap((slot) => {
    const id = spec.sharedAssets?.[slot];
    return id ? [{ id, slot }] : [];
  });
  const settled = await Promise.allSettled(references.map(({ id }) => fetchAvatarShareAsset(id)));
  return references.flatMap(({ slot }, index) => {
    const result = settled[index];
    if (result.status !== "fulfilled") return [];
    const asset = result.value;
    return asset?.status === "approved" && asset.hiddenAt === null && asset.slot === slot
      ? [{ slot, pixels: asset.pixels }]
      : [];
  });
}

/** Recheck server visibility at selection time before writing the private spec. */
export async function applyAvatarShareAsset(userId: string, selected: AvatarShareAsset): Promise<void> {
  const asset = await fetchAvatarShareAsset(selected.id);
  if (!asset || asset.status !== "approved" || asset.hiddenAt !== null || asset.slot !== selected.slot) {
    throw new Error("Avatar Share item is no longer available");
  }
  const current = await fetchAvatarSpec(userId);
  await saveAvatarSpec(userId, {
    ...(current ?? DEFAULT_AVATAR_SPEC),
    sharedAssets: { ...current?.sharedAssets, [asset.slot]: asset.id },
  });
}

export async function clearAvatarShareAsset(userId: string, slot: AvatarShareSlot): Promise<void> {
  const current = await fetchAvatarSpec(userId);
  if (!current?.sharedAssets?.[slot]) return;
  const sharedAssets = { ...current.sharedAssets };
  delete sharedAssets[slot];
  await saveAvatarSpec(userId, { ...current, sharedAssets });
}
