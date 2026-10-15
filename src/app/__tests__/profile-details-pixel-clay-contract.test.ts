import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = readFileSync(join(root, "src/app/profile-details.tsx"), "utf8");
const fieldSource = readFileSync(join(root, "src/components/m3/Field.tsx"), "utf8");

describe("/profile-details PIXEL-CLAY contract", () => {
  test("derives only the profilesetup surface pattern from real profile-detail state", () => {
    expect(source).toContain('import { PixelSurface } from "@/components/pixel"');
    expect(source).toContain('variant="frame"');
    // 혼인 여부 같은 성인 전용 칸은 성인에게만 그린다(Simon Q-261007-02).
    expect(source).toContain("PROFILE_DETAIL_FIELDS.filter((field) => !field.adultOnly || adult).map(");
    expect(source).toContain("const adult = isMinor === false;");
    // 이메일 · 생년월일은 보여주기만(Q-261007-04). 상태 메시지(0231)는 나이 제한 · 중복 확인 없이, 바뀐 경우에만 쓴다.
    expect(source).toContain('t("deepspace:profileDetails.emailLabel")');
    expect(source).toContain('t("deepspace:profileDetails.birthDateLabel")');
    expect(source).toContain("const statusChanged = statusReady && statusMessage.trim() !== savedStatusRef.current.trim();");
    expect(source).not.toContain("chatNameAvailable");
    // 아바타는 상자 폭을 채우는 정사각형, 수정은 오른쪽 위 연필(Simon 2026-10-07). 버튼은 없다.
    expect(source).toContain("<AvatarPreview spec={avatar.spec} size={avatarWidth} />");
    expect(source).toContain('<PixelGlyph name="edit"');
    expect(source).not.toContain('label={t("profile:avatarStudio.label")}');
    // Simon 2026-10-07: 안내 · 진행 칸 · 민감정보 안내 상자와 이름 설명 · 이름 저장 버튼을 걷어냈다.
    expect(source).not.toMatch(/<PixelSurface\s+variant="inset"/);
    expect(source).not.toContain('accessibilityRole="progressbar"');
    expect(source).not.toContain('t("deepspace:profileDetails.intro")');
    expect(source).not.toContain('t("deepspace:profileDetails.notSensitive")');
    expect(source).not.toContain('t("deepspace:profileDetails.nameHint")');
    expect(source).not.toContain('t("deepspace:profileDetails.nameSave")');

    // profilesetup의 목업 계정·아바타·고정 3/4를 이 편집 화면에 복제하지 않는다.
    expect(source).not.toContain("SecondbHead");
    // 실제 저장된 아바타 초상화와 스튜디오 진입은 있다(Simon 2026-10-07).
    expect(source).toContain("<AvatarPreview spec={avatar.spec} size={avatarWidth} />");
    expect(source).toContain('onPress={() => router.push("/avatar-studio")}');
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("3 / 4");
  });

  test("keeps every real field, reversible filter choices, and the save/error contract", () => {
    expect(source).toContain("fetchProfileDetailsSnapshot(userId)");
    expect(source).toContain("saveProfileDetails(saveUserId, details, detailsRevision.current)");
    expect(source).toContain('kind="filter"');
    expect(source).toContain("selected={value === choice}");
    expect(source).toContain('set(field.key, value === choice ? "" : choice)');
    expect(source).toContain('t("deepspace:profileDetails.saved")');
    expect(source).toContain('t("deepspace:profileDetails.saveError")');
    expect(source).toContain("loading={saving}");
  });

  test("scopes Android back to focus and keeps a safe deep-link fallback", () => {
    // 2026-10-02 (dashboard phone): Back goes through useHardwareBack, a focused
    // BackHandler listener standalone and the phone's claim stack inside the
    // phone, and navigation through useAppRouter() (lib/nav/phone-embed.tsx).
    expect(source).toContain("useHardwareBack(");
    expect(source).toContain("const router = useAppRouter();");
    expect(source).not.toContain("BackHandler.addEventListener");
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
    expect(source).toContain("<KeyboardAvoidingArea");
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

  test("only saves a confirmed owner name and refreshes the profile star", () => {
    expect(source).toContain("fetchDisplayName(userId)");
    expect(source).toContain('setNameLoadState({ userId, status: "error" })');
    expect(source).toContain('nameLoadState.userId === userId && nameLoadState.status === "ready"');
    // The one save button writes the name too, only for a name read from its owner and then changed.
    expect(source).toContain("if (nameReadyForUser && displayName !== savedNameRef.current) {");
    // The box starts with the name the app shows (Simon 2026-10-07); that shown name is also the baseline,
    // so an untouched email-derived name is never written back as the display name.
    expect(source).toContain("const shown = name?.trim() ? name : await loadProfileIdentity(userId).catch(() => null);");
    expect(source).toContain('savedNameRef.current = shown ?? "";');
    expect(source).toContain("saveDisplayName(saveUserId, displayName)");
    expect(source).toContain("activeUserIdRef.current === saveUserId");
    expect(source).toContain("invalidateProfileStarLevel(saveUserId)");
    expect(source).toContain("setNameReloadKey((key) => key + 1)");
    expect(source).toContain("maxLength={DISPLAY_NAME_MAX_LENGTH}");
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

});
