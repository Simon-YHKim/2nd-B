import { DEFAULT_AVATAR_SPEC } from "@/lib/avatar";
import { applyAvatarShareAsset, loadAvatarShareOverlays } from "@/lib/avatar-share/apply";
import { fetchAvatarShareAsset, type AvatarShareAsset } from "@/lib/avatar-share/api";
import { EMPTY_PIXELS, setPixel } from "@/lib/avatar-share/pixels";
import { fetchAvatarSpec, saveAvatarSpec } from "@/lib/supabase/avatar-spec";

jest.mock("@/lib/avatar-share/api", () => ({ fetchAvatarShareAsset: jest.fn() }));
jest.mock("@/lib/supabase/avatar-spec", () => ({
  fetchAvatarSpec: jest.fn(),
  saveAvatarSpec: jest.fn(),
}));

const asset: AvatarShareAsset = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  ownerId: "123e4567-e89b-42d3-a456-426614174001",
  title: "Red pixel",
  slot: "accessory",
  pixels: setPixel(EMPTY_PIXELS, 8, 8, 7),
  paletteVersion: 1,
  status: "approved",
  hiddenAt: null,
  createdAt: "2026-09-28T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchAvatarSpec).mockResolvedValue(DEFAULT_AVATAR_SPEC);
  jest.mocked(saveAvatarSpec).mockResolvedValue(undefined);
  jest.mocked(fetchAvatarShareAsset).mockResolvedValue(asset);
});

test("approved visible art can be imported into the private avatar slot", async () => {
  await applyAvatarShareAsset("viewer", asset);
  expect(saveAvatarSpec).toHaveBeenCalledWith("viewer", {
    ...DEFAULT_AVATAR_SPEC,
    sharedAssets: { accessory: asset.id },
  });
});

test("hidden or removed art cannot be imported or displayed", async () => {
  jest.mocked(fetchAvatarShareAsset).mockResolvedValueOnce({ ...asset, hiddenAt: "2026-09-28T01:00:00Z" });
  await expect(applyAvatarShareAsset("viewer", asset)).rejects.toThrow("no longer available");
  expect(saveAvatarSpec).not.toHaveBeenCalled();

  jest.mocked(fetchAvatarShareAsset).mockResolvedValueOnce(null);
  await expect(loadAvatarShareOverlays({
    ...DEFAULT_AVATAR_SPEC,
    sharedAssets: { accessory: asset.id },
  })).resolves.toEqual([]);
});

test("profile overlay loads the same approved pixels and slot", async () => {
  await expect(loadAvatarShareOverlays({
    ...DEFAULT_AVATAR_SPEC,
    sharedAssets: { accessory: asset.id },
  })).resolves.toEqual([{ slot: "accessory", pixels: asset.pixels }]);
});
