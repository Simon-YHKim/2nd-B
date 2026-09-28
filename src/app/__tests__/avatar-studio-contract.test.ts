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
    expect(source).toContain("<AvatarPreview spec={spec} size={128} />");
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
    expect(source).not.toContain("saveProfileDetails");
    expect(source).not.toContain("localStorage");
  });

  test("never saves failed or other-account reads, and scopes Android back to the focused route", () => {
    expect(source).toContain('setLoadState({ userId, status: "error" })');
    expect(source).toContain('loadState.userId === userId && loadState.status === "ready"');
    expect(source).toContain("if (!userId || !readyForUser || saveInFlightRef.current) return");
    expect(source).toContain("activeUserIdRef.current !== saveUserId");
    expect(source).toContain("await saveAvatarSpec(saveUserId, spec)");
    expect(source).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(source).toContain("return () => sub.remove()");
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

});
