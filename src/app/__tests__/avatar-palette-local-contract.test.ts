import { readFileSync } from "node:fs";
import { join } from "node:path";

const screen = readFileSync(join(process.cwd(), "src/app/avatar-palette.tsx"), "utf8");

describe("Avatar Palette local-only screen", () => {
  test("keeps drawing and per-slot local drafts without public network actions", () => {
    expect(screen).toContain('from "@/lib/avatar-palette/draft"');
    expect(screen).toContain('from "@/lib/avatar-palette/pixels"');
    expect(screen).toContain("loadAvatarPaletteDraft(owner, slot)");
    expect(screen).toContain("saveAvatarPaletteDraft(userId, { slot, ...snapshot })");
    expect(screen).toContain("deleteAvatarPaletteDraft(userId, slot)");
    expect(screen).toContain("AVATAR_PALETTE_SLOTS.map");
    expect(screen).toContain("AVATAR_PALETTE.map");
    expect(screen).toContain("setPixel(pixelsRef.current, x, y, colorIndex)");
    expect(screen).toContain("<AvatarPreview spec={DEFAULT_AVATAR_SPEC}");
    expect(screen).not.toContain("@/lib/avatar-share/api");
    expect(screen).not.toMatch(/submitAvatarShareAsset|listPublishedAssets|reportAvatarShareAsset|blockAvatarShareCreator/);
  });

  test("allows profile-complete users of any age and isolates account drafts", () => {
    expect(screen).toContain("if (hasProfile === false) return <Redirect href=\"/complete-profile\" />");
    expect(screen).toContain("currentUserRef.current !== owner");
    expect(screen).toContain("captureAccountOwnerLease(userId)");
    expect(screen).not.toMatch(/isMinor|adultOnly|rightsConfirmed|reuseConfirmed/);
  });

  test("protects dirty work on slot change and route removal", () => {
    expect(screen).toContain('usePreventRemove(dirty && !allowExit');
    expect(screen).toContain('setPendingTransition({ kind: "slot", slot: next })');
    expect(screen).toContain('setPendingTransition({ kind: "exit" })');
    expect(screen).toContain("if (save && !(await saveCurrent())) return");
    expect(screen).toContain('t("avatarPalette:saveAndContinue")');
    expect(screen).toContain('t("avatarPalette:discardAndContinue")');
  });

  test("confirms destructive local edits and explains device-only storage", () => {
    expect(screen).toContain('t("avatarPalette:localOnly")');
    expect(screen).toContain('t("avatarPalette:clearConfirm")');
    expect(screen).toContain('t("avatarPalette:deleteConfirm")');
    expect(screen).toContain('t("avatarPalette:loadError")');
    expect(screen).toContain('t("avatarPalette:saveError")');
  });
});
