import { readFileSync } from "node:fs";
import { join } from "node:path";

const screen = readFileSync(join(process.cwd(), "src/app/avatar-palette.tsx"), "utf8");

describe("Avatar Palette personal gallery", () => {
  test("keeps drawing and ID-based local artwork without public network actions", () => {
    expect(screen).toContain('from "@/lib/avatar-palette/gallery"');
    expect(screen).toContain('from "@/lib/avatar-palette/pixels"');
    expect(screen).toContain("listAvatarPaletteItems(owner)");
    expect(screen).toContain("saveAvatarPaletteItem(userId, { id: editingItemId ?? undefined, ...snapshot })");
    expect(screen).toContain("deleteAvatarPaletteItem(userId, id)");
    expect(screen).toContain("AVATAR_PALETTE_SLOTS.map");
    expect(screen).toContain("AVATAR_PALETTE.map");
    expect(screen).toContain("setPixel(pixelsRef.current, x, y, colorIndex)");
    expect(screen).toContain("<AvatarPreview spec={DEFAULT_AVATAR_SPEC}");
    expect(screen).not.toContain("@/lib/avatar-share/api");
    expect(screen).not.toMatch(/submitAvatarShareAsset|listPublishedAssets|reportAvatarShareAsset|blockAvatarShareCreator/);
  });

  test("virtualizes artwork cards with a thumbnail, title, slot and modified date", () => {
    expect(screen).toContain("<FlatList");
    expect(screen).toContain("initialNumToRender={2}");
    expect(screen).toContain("maxToRenderPerBatch={2}");
    expect(screen).toContain("windowSize={3}");
    expect(screen).toContain("<PixelLayer pixels={item.pixels} size={64} />");
    expect(screen).toContain('item.title || t("avatarPalette:untitled")');
    expect(screen).toContain('t(`avatarPalette:slots.${item.slot}`)');
    // R2B-02: the painted UI language, not resolvedLanguage (frozen to EN for es/pt/id).
    expect(screen).toContain("new Date(item.updatedAt).toLocaleDateString(renderedUiLanguage(i18n))");
  });

  test("allows profile-complete users of any age and isolates account artwork", () => {
    expect(screen).toContain('if (hasProfile === false) return <Redirect href="/complete-profile" />');
    expect(screen).toContain("currentUserRef.current !== owner");
    expect(screen).toContain("captureAccountOwnerLease(userId)");
    expect(screen).not.toMatch(/isMinor|adultOnly|rightsConfirmed|reuseConfirmed/);
  });

  test("protects dirty work when opening, creating or leaving", () => {
    expect(screen).toContain("usePreventRemove(dirty && !allowExit");
    expect(screen).toContain('gestureEnabled: viewMode !== "editor"');
    expect(screen).toContain('if (dirty) { setPendingTransition(next); return; }');
    expect(screen).toContain('setPendingTransition({ kind: "exit" })');
    expect(screen).toContain("if (save && !(await saveCurrent())) return");
    expect(screen).toContain('t("avatarPalette:saveAndContinue")');
    expect(screen).toContain('t("avatarPalette:discardAndContinue")');
    expect(screen).toContain("setSlot(next.slot)");
    expect(screen).toContain("setTitle(next.title)");
    expect(screen).toContain("setPixels(next.pixels)");
    expect(screen).toContain("setEditingItemId(item?.id ?? null)");
  });

  test("confirms deletion and explains device-only storage", () => {
    expect(screen).toContain('t("avatarPalette:localOnly")');
    expect(screen).toContain('t("avatarPalette:clearConfirm")');
    expect(screen).toContain('t("avatarPalette:deleteConfirm"');
    expect(screen).toContain('t("avatarPalette:loadError")');
    expect(screen).toContain('t("avatarPalette:saveError")');
    expect(screen).toContain("AVATAR_PALETTE_GALLERY_LIMIT");
  });
});
