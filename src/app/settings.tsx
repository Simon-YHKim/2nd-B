// Settings screen — primarily the "Danger zone" for data deletion.
// Three modes per user requirement: select-only (handled inline on
// /journal etc.), partial (per-kind / per-tag), and full (everything).

import { useState } from "react";
import { ScrollView, StyleSheet, View, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import { AppNav } from "@/components/ui/AppNav";
import { useTheme } from "@/lib/theme/ThemeContext";
import {
  deleteAllChatUsage,
  deleteAllUserData,
  deleteAllWikiPages,
  deleteRecordsByKind,
  deleteRecordsByTag,
  deleteUningestedSources,
} from "@/lib/records/delete-bulk";

const CONFIRM_PHRASE = "DELETE";

export default function Settings() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { mode, toggle } = useTheme();

  const [busy, setBusy] = useState<string | null>(null);
  const [fullDeleteConfirm, setFullDeleteConfirm] = useState("");

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  function confirm(message: string, onYes: () => Promise<void>): void {
    Alert.alert(
      locale === "ko" ? "정말 진행할까요?" : "Are you sure?",
      message,
      [
        { text: locale === "ko" ? "취소" : "Cancel", style: "cancel" },
        {
          text: locale === "ko" ? "삭제" : "Delete",
          style: "destructive",
          onPress: () => {
            void onYes();
          },
        },
      ],
    );
  }

  async function runDeleteKind(kind: "journal" | "note" | "audit_response", label: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const n = await deleteRecordsByKind(userId, kind);
      Alert.alert(locale === "ko" ? "완료" : "Done", locale === "ko" ? `${n}개 삭제됨` : `Deleted ${n}`);
    } catch (e) {
      Alert.alert(locale === "ko" ? "삭제 실패" : "Delete failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteByTag(tags: string[], label: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const n = await deleteRecordsByTag(userId, tags);
      Alert.alert(locale === "ko" ? "완료" : "Done", locale === "ko" ? `${n}개 삭제됨` : `Deleted ${n}`);
    } catch (e) {
      Alert.alert(locale === "ko" ? "삭제 실패" : "Delete failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteWikiPages() {
    if (!userId) return;
    setBusy("wikiPages");
    try {
      const n = await deleteAllWikiPages(userId);
      Alert.alert(locale === "ko" ? "완료" : "Done", locale === "ko" ? `${n}개 위키 페이지 삭제됨` : `Deleted ${n} wiki pages`);
    } catch (e) {
      Alert.alert(locale === "ko" ? "삭제 실패" : "Delete failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteUningestedSources() {
    if (!userId) return;
    setBusy("sources");
    try {
      const n = await deleteUningestedSources(userId);
      Alert.alert(locale === "ko" ? "완료" : "Done", locale === "ko" ? `${n}개 캡처 삭제됨` : `Deleted ${n} captures`);
    } catch (e) {
      Alert.alert(locale === "ko" ? "삭제 실패" : "Delete failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runResetChatUsage() {
    if (!userId) return;
    setBusy("chat");
    try {
      const n = await deleteAllChatUsage(userId);
      Alert.alert(locale === "ko" ? "완료" : "Done", locale === "ko" ? `${n}일치 사용량 리셋됨` : `Reset ${n} days of usage`);
    } catch (e) {
      Alert.alert(locale === "ko" ? "실패" : "Failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runFullWipe() {
    if (!userId) return;
    setBusy("full");
    try {
      const result = await deleteAllUserData(userId);
      Alert.alert(
        locale === "ko" ? "전체 삭제 완료" : "Full wipe complete",
        locale === "ko"
          ? `기록 ${result.records} · 캡처 ${result.sources} · 위키 ${result.wikiPages} · 사용량 ${result.chatUsage}`
          : `records ${result.records} · sources ${result.sources} · wiki ${result.wikiPages} · usage ${result.chatUsage}`,
      );
      setFullDeleteConfirm("");
      router.replace("/journal");
    } catch (e) {
      Alert.alert(locale === "ko" ? "전체 삭제 실패" : "Full wipe failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "08. 설정" : "08. Settings"}
          title={locale === "ko" ? "마을의 규칙을 정리해요" : "Tune the village rules"}
          subtitle={
            locale === "ko"
              ? "테마 · 데이터 · 프로필 · 지원"
              : "Theme · data · profile · support"
          }
          island="relationship"
          worker="gadi"
          speech={
            locale === "ko"
              ? "삭제는 되돌릴 수 없어요. 필요한 조각은 먼저 내보내기로 챙겨두세요."
              : "Deletion cannot be undone. Export anything you need before clearing data."
          }
          primaryAction={{
            label: locale === "ko" ? "데이터 관리" : "Data management",
            onPress: () => router.push("/data"),
          }}
          secondaryAction={{
            label: locale === "ko" ? "지식 창고" : "Knowledge store",
            variant: "secondary",
            onPress: () => router.push("/wiki"),
          }}
          railIcons={["⌂", "⚙", "◇", "▣"]}
        />

        {/* Navigation hub (A-to-Z Phase 12) — the settings sub-screens. */}
        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {locale === "ko" ? "설정 항목" : "Settings"}
          </Text>
          <Button label={locale === "ko" ? "프로필" : "Profile"} variant="secondary" onPress={() => router.push("/profile")} />
          <Button label={locale === "ko" ? "테마" : "Theme"} variant="secondary" onPress={() => router.push("/theme")} />
          <Button label={locale === "ko" ? "데이터 관리" : "Data management"} variant="secondary" onPress={() => router.push("/data")} />
          <Button label={locale === "ko" ? "기록" : "Records"} variant="secondary" onPress={() => router.push("/records")} />
          <Button label={locale === "ko" ? "지원" : "Support"} variant="secondary" onPress={() => router.push("/support")} />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="brand" style={styles.sectionEyebrow}>
            {locale === "ko" ? "테마 (빠른 전환)" : "Theme (quick toggle)"}
          </Text>
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "메인 화면의 어두운 하늘 톤이 기본. 밝은 톤도 시도해 보세요."
              : "Defaults to the loader's dark-sky tone. Light is also available."}
          </Text>
          <View style={styles.themeRow}>
            <Button
              label={locale === "ko" ? "다크" : "Dark"}
              variant={mode === "dark" ? "primary" : "secondary"}
              onPress={() => { if (mode !== "dark") toggle(); }}
            />
            <Button
              label={locale === "ko" ? "라이트" : "Light"}
              variant={mode === "light" ? "primary" : "secondary"}
              onPress={() => { if (mode !== "light") toggle(); }}
            />
          </View>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
          <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
            {locale === "ko" ? "부분 삭제 (종류별)" : "Partial — by kind"}
          </Text>
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "특정 종류의 기록만 삭제. 다른 종류와 위키는 그대로 둡니다."
              : "Delete one kind only. Other kinds and your wiki stay."}
          </Text>
          <Button
            label={locale === "ko" ? "모든 일기 삭제" : "Delete all journals"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "모든 일기를 삭제합니다." : "Delete every journal entry.",
                () => runDeleteKind("journal", "journal"),
              )
            }
          />
          <Button
            label={locale === "ko" ? "모든 노트 삭제" : "Delete all notes"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "모든 노트를 삭제합니다 (평가 결과 포함)." : "Delete every note (assessments included).",
                () => runDeleteKind("note", "note"),
              )
            }
          />
          <Button
            label={locale === "ko" ? "과거의 나 응답 삭제" : "Delete audit responses"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "모든 과거의 나 응답을 삭제합니다." : "Delete every audit response.",
                () => runDeleteKind("audit_response", "audit"),
              )
            }
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
          <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
            {locale === "ko" ? "부분 삭제 (평가 결과)" : "Partial — by assessment"}
          </Text>
          <Button
            label={locale === "ko" ? "Big Five (TIPI) 결과 삭제" : "Delete Big Five (TIPI) results"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "저장된 모든 TIPI 결과를 삭제합니다." : "Delete every saved TIPI result.",
                () => runDeleteByTag(["tipi"], "tipi"),
              )
            }
          />
          <Button
            label={locale === "ko" ? "애착 (ECR) 결과 삭제" : "Delete Attachment (ECR) results"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "저장된 모든 ECR 결과를 삭제합니다." : "Delete every saved ECR result.",
                () => runDeleteByTag(["ecr"], "ecr"),
              )
            }
          />
          <Button
            label={locale === "ko" ? "MBTI 결과 삭제" : "Delete MBTI results"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "저장된 모든 MBTI 결과를 삭제합니다." : "Delete every saved MBTI result.",
                () => runDeleteByTag(["mbti"], "mbti"),
              )
            }
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
          <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
            {locale === "ko" ? "부분 삭제 (위키/캡처/사용량)" : "Partial — wiki / captures / usage"}
          </Text>
          <Button
            label={locale === "ko" ? "모든 위키 페이지 삭제" : "Delete all wiki pages"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "위키 페이지와 [[wikilink]] 연결이 모두 삭제됩니다. 소스(받은편지함)는 남아요." : "Wiki pages and [[wikilink]] edges are wiped. Sources (inbox) stay.",
                () => runDeleteWikiPages(),
              )
            }
          />
          <Button
            label={locale === "ko" ? "미발전 캡처 삭제 (받은편지함의 미정리분)" : "Delete un-ingested captures"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "위키로 발전시키지 않은 캡처만 삭제합니다." : "Only sources that haven't been promoted to a wiki page.",
                () => runDeleteUningestedSources(),
              )
            }
          />
          <Button
            label={locale === "ko" ? "세컨비 일일 사용량 리셋" : "Reset SecondB daily usage"}
            variant="secondary"
            disabled={busy !== null}
            onPress={() =>
              confirm(
                locale === "ko" ? "오늘과 과거 모든 사용량 카운터를 비웁니다." : "Clear today's and all past usage counters.",
                () => runResetChatUsage(),
              )
            }
          />
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.danger }]}>
          <Text variant="caption" color="danger" style={styles.sectionEyebrow}>
            {locale === "ko" ? "위험 — 전체 삭제" : "Danger — full wipe"}
          </Text>
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "기록 · 캡처 · 위키 페이지 · 세컨비 사용량을 한 번에 모두 삭제합니다. 계정은 유지되지만 0부터 다시 시작합니다."
              : "Wipes records, sources, wiki pages, and SecondB usage in one shot. The account stays but you start from zero."}
          </Text>
          <Text variant="subtle" color="textMuted">
            {locale === "ko" ? `진행하려면 "${CONFIRM_PHRASE}" 라고 입력하세요.` : `To proceed, type "${CONFIRM_PHRASE}" below.`}
          </Text>
          <Input
            value={fullDeleteConfirm}
            onChangeText={setFullDeleteConfirm}
            placeholder={CONFIRM_PHRASE}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Button
            label={locale === "ko" ? "전체 데이터 삭제" : "Delete everything"}
            variant="primary"
            disabled={fullDeleteConfirm !== CONFIRM_PHRASE || busy !== null}
            loading={busy === "full"}
            onPress={() =>
              confirm(
                locale === "ko" ? "마지막 확인: 모든 데이터가 사라집니다. 익스포트는 미리 받으셨나요?" : "Final check: everything will be gone. Did you export first?",
                () => runFullWipe(),
              )
            }
          />
        </View>

        <View style={styles.actions}>
          <Button
            label={locale === "ko" ? "로그아웃" : "Sign out"}
            variant="secondary"
            onPress={async () => {
              try {
                await signOut();
                // Go straight to /sign-in. Routing via "/" could briefly render
                // with a stale session before the SIGNED_OUT event lands.
                router.replace("/sign-in");
              } catch (e) {
                Alert.alert(locale === "ko" ? "로그아웃 실패" : "Sign-out failed", (e as Error).message);
              }
            }}
          />
        </View>
        <AppNav locale={locale} />
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: "#A78BFA",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  sectionEyebrow: { letterSpacing: 1, fontWeight: "700" },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  themeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
});
