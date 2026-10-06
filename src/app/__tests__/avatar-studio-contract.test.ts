import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/avatar-studio.tsx"), "utf8");

describe("approved avatar studio screen", () => {
  test("makes all catalog groups reachable with bounded PNG choice previews and one live combination", () => {
    for (const group of ["hair", "accessory", "face", "expression", "animal", "job", "garment"]) {
      expect(source).toContain(`"${group}"`);
    }
    expect(source).toContain("AVATAR_CATALOG[category]");
    expect(source).toContain("getAvatarThumbnail(item.category, item.item.id)");
    expect(source).toContain("getAnimalFurColors(species)");
    expect(source).toContain("<FlatList");
    expect(source).toContain("numColumns={3}");
    // Simon 2026-10-07: the live avatar is half the preview box, the type buttons sit beside it, and the
    // sample badge, the choice count and the sample note are gone (the a11y hint keeps the sample note).
    expect(source).toContain("<AvatarPreview spec={spec} size={avatarSize} />");
    expect(source).toContain("const avatarSize = previewWidth > 0 ? Math.floor(previewWidth / 2) : 0;");
    expect(source).not.toContain('t("avatar:sample")');
    expect(source).not.toContain('"avatar:choiceCount"');
    expect(source).not.toContain('t("avatar:previewHint")');
    expect(source).toContain("t(\"avatar:sampleHint\")");
  });

  test("keeps wardrobe independent and explains hidden choices", () => {
    expect(source).toContain("garmentId: null, wearUniform: true");
    expect(source).toContain("garmentId: id, wearUniform: false");
    expect(source).toContain('const ANIMAL_CATEGORIES: readonly Category[] = ["animal", "accessory", "expression", "garment", "color"]');
    expect(source).toContain('case "animal": patch({ type: "animal", species: id });');
    expect(source).toContain('case "garment": patch({ garmentId: id, wearUniform: false });');
    expect(source).not.toContain("humanRoleRef");
    expect(source).not.toContain('case "garment": patch({ garmentId: id, wearUniform: false, type: "human" });');
    expect(source).toContain("isAvatarAccessoryOccluded(spec)");
    expect(source).toContain('t("avatar:jobHint")');
    // Simon 2026-10-07: the animal note is gone; tabs are never narrower than they are tall.
    expect(source).not.toContain('t("avatar:animalHint")');
    expect(source).toContain("tabContent: { minHeight: m3.minTouch, minWidth: 64,");
    expect(source).not.toContain("saveProfileDetails");
    expect(source).not.toContain("localStorage");
  });

  test("never saves failed or other-account reads, and scopes Android back to the focused route", () => {
    expect(source).toContain('setLoadState({ userId, status: "error" })');
    expect(source).toContain('loadState.userId === userId && loadState.status === "ready"');
    expect(source).toContain("if (!userId || !readyForUser || saveInFlightRef.current) return");
    expect(source).toContain("activeUserIdRef.current !== saveUserId");
    expect(source).toContain("await saveAvatarSpec(saveUserId, spec)");
    // 2026-10-02 (dashboard phone): Back goes through useHardwareBack, a focused
    // BackHandler listener standalone and the phone's claim stack inside the
    // phone, and navigation through useAppRouter() (lib/nav/phone-embed.tsx).
    expect(source).toContain("useHardwareBack(");
    expect(source).toContain("const router = useAppRouter();");
    expect(source).not.toContain("BackHandler.addEventListener");
    expect(source).toContain('router.replace("/profile")');
  });

  // The avatar is an optional profile choice: the privacy policy promises that
  // leaving optional profile fields empty never limits the service. Setup must
  // always be leavable (back, hardware back, "Later"), deferring for the session.
  test("offers first-run setup but can always be left for later", () => {
    expect(source).toContain('const setupMode = setup === "1"');
    expect(source).toContain('if (setupMode) router.replace("/")');
    expect(source).toContain('t("avatar:setupRequiredHint")');
    expect(source).toContain("if (userId) markAvatarSetupDeferredForSession(userId);");
    expect(source).toContain("onBack={onCancel}");
    expect(source).toContain('accessibilityLabel={t("avatar:setupLater")}');
    expect(source).not.toContain('if (loadState.status === "error" && userId)');
  });

  // D-08 (QA 261004): the category/colour tab strips are horizontal ScrollViews
  // inside a height-bounded column. Without flexShrink 0 Yoga squeezed the strip
  // to 28.6dp of its 64dp on Android, cutting the tabs and their touch targets.
  test("horizontal tab strips keep their own height", () => {
    const strips = source.match(/<ScrollView horizontal[^>]*>/g) ?? [];
    expect(strips.length).toBeGreaterThanOrEqual(2);
    for (const tag of strips) expect(tag).toContain("style={styles.tabStrip}");
    expect(source).toContain("tabStrip: { flexGrow: 0, flexShrink: 0 },");
  });
});
