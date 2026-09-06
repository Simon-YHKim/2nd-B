import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = readFileSync(join(root, "src/app/profile-details.tsx"), "utf8");
const fieldSource = readFileSync(join(root, "src/components/m3/Field.tsx"), "utf8");

describe("/profile-details PIXEL-CLAY contract", () => {
  test("derives only the profilesetup surface pattern from real profile-detail state", () => {
    expect(source).toContain('import { PixelSurface } from "@/components/pixel"');
    expect(source).toMatch(/<PixelSurface\s+variant="inset"/);
    expect(source).toContain('variant="frame"');
    expect(source).toContain('accessibilityRole="progressbar"');
    expect(source).toContain("accessibilityLabel={title}");
    expect(source).toMatch(/accessibilityValue=\{\{\s*text: t\("deepspace:profileDetails\.progress"/);
    expect(source).toContain("PROFILE_DETAIL_FIELDS.map");
    expect(source).toContain("details[field.key]?.trim()");

    // profilesetup의 목업 계정·아바타·고정 3/4를 이 편집 화면에 복제하지 않는다.
    expect(source).not.toContain("SecondbHead");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("3 / 4");
  });

  test("keeps every real field, reversible filter choices, and the save/error contract", () => {
    expect(source).toContain("fetchProfileDetails(userId)");
    expect(source).toContain("saveProfileDetails(saveUserId, details)");
    expect(source).toContain('kind="filter"');
    expect(source).toContain("selected={value === choice}");
    expect(source).toContain('set(field.key, value === choice ? "" : choice)');
    expect(source).toContain('t("deepspace:profileDetails.saved")');
    expect(source).toContain('t("deepspace:profileDetails.saveError")');
    expect(source).toContain("loading={saving}");
  });

  test("scopes Android back to focus and keeps a safe deep-link fallback", () => {
    expect(source).toContain("useFocusEffect(");
    expect(source).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(source).toContain("return () => sub.remove()");
    expect(source).toContain("router.canGoBack()");
    expect(source).toContain('router.replace("/profile")');
    expect(source.match(/onBack=\{onCancel\}/g)).toHaveLength(6);
  });

  test("resolves signed-out and confirmed profile-missing auth states before neutral loaders", () => {
    const authLoading = source.indexOf("if (authLoading)");
    const signedOut = source.indexOf('if (!userId) return <Redirect href="/sign-in" />');
    const probeFailure = source.indexOf("if (hasProfile === false && profileProbeFailed)");
    const missingProfile = source.indexOf(
      'if (hasProfile === false) return <Redirect href="/complete-profile" />',
    );
    const unresolvedProfile = source.indexOf("if (hasProfile !== true)");

    expect(Math.min(authLoading, signedOut, probeFailure, missingProfile, unresolvedProfile)).toBeGreaterThan(-1);
    expect(authLoading).toBeLessThan(signedOut);
    expect(signedOut).toBeLessThan(probeFailure);
    expect(probeFailure).toBeLessThan(missingProfile);
    expect(missingProfile).toBeLessThan(unresolvedProfile);
  });

  test("keeps the form above the Android keyboard and gives Korean text a bottom-safe line box", () => {
    expect(source).toContain("const kbHeight = useKeyboard()");
    expect(source).toContain("<KeyboardAvoidingView");
    expect(source).toContain('Platform.OS === "android"');
    expect(source).toContain("kbHeight + deepSpaceSpacing.lg");
    expect(source).toContain("lineHeight: m3.type.bodyLarge.line");
    expect(source).toContain("lineHeight: m3.type.bodyMedium.line");
    expect(source).toContain("paddingBottom: m3.spacing.s1");
  });

  test("never exposes stale or failed account data to the full-replacement save", () => {
    expect(source).toContain('setLoadState({ userId, status: "loading" })');
    expect(source).toContain('setLoadState({ userId, status: "ready" })');
    expect(source).toContain('setLoadState({ userId, status: "error" })');
    expect(source).toContain(
      'loadState.userId === userId && loadState.status === "ready"',
    );
    expect(source).toContain("if (!userId || !readyForUser || saving) return");
    expect(source).toContain("disabled={!readyForUser || saving}");
    expect(source).toContain('t("common:errors.network")');
    expect(source).toContain('t("common:actions.retry")');
    expect(source).toContain("setReloadKey((key) => key + 1)");
    expect(source).toContain("refresh: refreshAuth");
    expect(source).toContain("onPress={() => void refreshAuth()}");
  });

  test("relays Android IME next through consecutive text fields", () => {
    expect(fieldSource).toContain("forwardRef<TextInput, FieldProps>");
    expect(fieldSource).toContain("ref={ref}");
    expect(fieldSource).toContain("input: { minHeight: m3.minTouch");
    expect(source).toContain('field.key === "occupation" || field.key === "region" ? "next" : "done"');
    expect(source).toContain("regionRef.current?.focus()");
    expect(source).toContain("householdRef.current?.focus()");
  });

  test("keeps the actual input and short filter semantics at the 44dp target", () => {
    expect(source).toContain("style={styles.choiceChip}");
    expect(source).toContain("choiceChip: { minWidth: m3.minTouch + m3.spacing.s1 }");
  });

  test("freezes edits while saving and ignores settlement from an old account operation", () => {
    expect(source).toContain("editable={!saving}");
    expect(source).toContain("saving ? undefined : () => set(field.key");
    expect(source).toContain("const operation = ++saveOperationRef.current");
    expect(source).toContain("activeUserIdRef.current === saveUserId");
    expect(source).toContain("if (!isCurrentOperation()) return");
    expect(source).toContain("if (isCurrentOperation()) setSaving(false)");
  });

  test("announces progress once through the progressbar semantics", () => {
    expect(source).toContain("accessibilityRole=\"progressbar\"");
    expect(source).toMatch(
      /<Text\s+accessible=\{false\}\s+accessibilityElementsHidden\s+importantForAccessibility="no"\s+style=\{styles\.progress\}/,
    );
  });
});
