// 휴식 담기: recreation_items의 실제 owner-scoped 목록과 쓰기 화면.
//
// 디자인 번들의 `rest`는 샘플 데이터로 만든 비교 화면이라 이식하지 않는다.
// 이 화면은 실제 데이터·세 상태·종류·저장 실패 계약은 그대로 두고, 공용
// PIXEL-CLAY 표면과 가상 목록으로만 표현을 바꾼다.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SectionList,
  StyleSheet,
  Text as RNText,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdChip, SegBtn } from "@/components/m3";
import { m3TextStyle } from "@/components/m3/typeface";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  createRecreationItem,
  listRecreationItems,
  type RecreationCategory,
  type RecreationItem,
  type RecreationStatus,
} from "@/lib/recreation/items";
import { useFontStyle } from "@/lib/settings/readable-font";
import { m3 } from "@/lib/theme/m3";
import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { useKeyboard } from "@/lib/ui/useKeyboard";

const STATUS_ORDER: readonly RecreationStatus[] = ["active", "want", "done"];
const CATEGORIES: readonly RecreationCategory[] = [
  "game",
  "movie",
  "music",
  "travel",
  "show",
  "hobby",
  "other",
];

const CATEGORY_ICON = {
  game: "grid",
  movie: "movie",
  music: "auto_awesome",
  travel: "arrow_forward",
  show: "campaign",
  hobby: "favorite",
  other: "box",
} as const;

const STATUS_COLOR: Readonly<Record<RecreationStatus, string>> = {
  active: m3.accent.starCore,
  want: m3.color.onSurfaceVariant,
  done: m3.accent.moodPositive,
};

export default function RestScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading } = useAuth();
  const kbHeight = useKeyboard();
  // `m3TextStyle()` reads this preference synchronously. Subscribing here makes
  // the virtualized rows re-render when the readable body font is toggled.
  useFontStyle();

  const [items, setItems] = useState<RecreationItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<RecreationCategory>("hobby");
  const [status, setStatus] = useState<RecreationStatus>("want");

  const ratingLabel = useCallback(
    (rating: number) =>
      t("deepspace:rest.ratingLabel", { rating: Math.min(5, rating) }),
    [t],
  );

  const refresh = useCallback(() => {
    if (!userId) return;
    listRecreationItems(userId)
      .then(setItems)
      .catch((e) => {
        // Preserve the existing fail-soft behavior: a read failure does not
        // invent records and lands on the same neutral empty surface.
        console.warn("[rest] list failed", (e as Error).message);
        setItems([]);
      });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sections = useMemo(
    () =>
      STATUS_ORDER.map((sectionStatus) => ({
        title: sectionStatus,
        data: (items ?? []).filter((item) => item.status === sectionStatus),
      })).filter((section) => section.data.length > 0),
    [items],
  );

  if (loading) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="museumLike"
        title={t("deepspace:rest.title")}
        onBack={() => router.back()}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={t("deepspace:rest.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  async function handleAdd() {
    if (!userId || !title.trim() || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await createRecreationItem(userId, {
        title: title.trim(),
        category,
        status,
      });
      setTitle("");
      setAdding(false);
      refresh();
    } catch (e) {
      console.warn("[rest] save failed", (e as Error).message);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const addLabel = adding
    ? t("deepspace:rest.close")
    : t("deepspace:rest.addRest");

  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="museumLike"
      title={t("deepspace:rest.title")}
      onBack={() => router.back()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          contentContainerStyle={[
            styles.listContent,
            Platform.OS === "android" && {
              paddingBottom: Math.max(
                deepSpaceSpacing.xl,
                kbHeight + deepSpaceSpacing.lg,
              ),
            },
          ]}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.actionRow}>
                <PixelPressable
                  variant={adding ? "inset" : "bevel"}
                  onPress={() => setAdding((value) => !value)}
                  accessibilityLabel={addLabel}
                  disabled={saving}
                  contentStyle={styles.actionContent}
                >
                  <PixelGlyph
                    name={adding ? "close" : "add"}
                    color={m3.color.primary}
                    size={24}
                  />
                  <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
                    {addLabel}
                  </RNText>
                </PixelPressable>
              </View>

              {adding ? (
                <PixelSurface variant="frame" contentStyle={styles.formContent}>
                  <Field
                    label={t("deepspace:rest.whatLabel")}
                    value={title}
                    onChangeText={setTitle}
                    placeholder={t("deepspace:rest.whatPlaceholder")}
                    editable={!saving}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => void handleAdd()}
                  />
                  <RNText style={[m3TextStyle("labelMedium"), styles.fieldLabel]}>
                    {t("deepspace:rest.categoryLabel")}
                  </RNText>
                  <View style={styles.chipWrap}>
                    {CATEGORIES.map((categoryKey) => (
                      <MdChip
                        key={categoryKey}
                        kind="filter"
                        label={t(`deepspace:rest.category.${categoryKey}`)}
                        selected={category === categoryKey}
                        disabled={saving}
                        onPress={() => setCategory(categoryKey)}
                      />
                    ))}
                  </View>
                  <RNText style={[m3TextStyle("labelMedium"), styles.fieldLabel]}>
                    {t("deepspace:rest.statusLabel")}
                  </RNText>
                  <SegBtn
                    segments={STATUS_ORDER.map((statusKey) => ({
                      key: statusKey,
                      label: t(`deepspace:rest.status.${statusKey}`),
                    }))}
                    selected={[status]}
                    disabled={saving}
                    onSelect={(key) => setStatus(key as RecreationStatus)}
                  />
                  {saveFailed ? (
                    <RNText
                      accessibilityRole="alert"
                      style={[m3TextStyle("bodySmall"), styles.saveError]}
                    >
                      {t("deepspace:rest.saveFailed")}
                    </RNText>
                  ) : null}
                  <MdButton
                    variant="filled"
                    disabled={!title.trim() || saving}
                    loading={saving}
                    label={
                      saving
                        ? t("deepspace:rest.saving")
                        : t("deepspace:rest.save")
                    }
                    onPress={() => void handleAdd()}
                    style={styles.saveButton}
                  />
                </PixelSurface>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            items === null ? (
              <View style={styles.listState}>
                <PremiumLoadingState message={t("deepspace:rest.opening")} />
              </View>
            ) : (
              <PixelSurface variant="inset" contentStyle={styles.emptyContent}>
                <PixelGlyph
                  name="favorite"
                  color={m3.accent.starCore}
                  size={24}
                />
                <RNText style={[m3TextStyle("bodyMedium"), styles.emptyText]}>
                  {t("deepspace:rest.empty")}
                </RNText>
              </PixelSurface>
            )
          }
          renderSectionHeader={({ section }) => (
            <View accessibilityRole="header" style={styles.sectionHeader}>
              <View
                style={[
                  styles.statusMark,
                  { backgroundColor: STATUS_COLOR[section.title] },
                ]}
              />
              <RNText style={[m3TextStyle("titleSmall"), styles.sectionTitle]}>
                {t(`deepspace:rest.status.${section.title}`)}
              </RNText>
              <RNText style={[m3TextStyle("labelSmall"), styles.sectionCount]}>
                {section.data.length}
              </RNText>
              <View style={styles.sectionRule} />
            </View>
          )}
          renderItem={({ item, section }) => (
            <PixelSurface
              variant="frame"
              style={styles.itemSurface}
              contentStyle={styles.itemContent}
            >
              <View
                style={[
                  styles.itemStatus,
                  { backgroundColor: STATUS_COLOR[section.title] },
                ]}
              />
              <PixelSurface
                variant="inset"
                style={styles.itemIconSurface}
                contentStyle={styles.itemIcon}
              >
                <PixelGlyph
                  name={CATEGORY_ICON[item.category]}
                  color={deepSpace.accentSoft}
                  size={24}
                />
              </PixelSurface>
              <View style={styles.itemCopy}>
                <RNText
                  style={[m3TextStyle("bodyLarge"), styles.itemTitle]}
                  numberOfLines={1}
                >
                  {item.title}
                </RNText>
                <RNText
                  style={[m3TextStyle("bodySmall"), styles.itemMeta]}
                  numberOfLines={2}
                >
                  {t(`deepspace:rest.category.${item.category}`)}
                  {item.occurred_on ? ` · ${item.occurred_on}` : ""}
                  {item.rating ? ` · ${ratingLabel(item.rating)}` : ""}
                </RNText>
              </View>
            </PixelSurface>
          )}
        />
      </KeyboardAvoidingView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    flexGrow: 1,
    padding: deepSpaceSpacing.lg,
    paddingBottom: deepSpaceSpacing.xl,
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  listHeader: { gap: deepSpaceSpacing.md, marginBottom: deepSpaceSpacing.md },
  actionRow: { alignItems: "flex-end" },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s6,
  },
  actionLabel: { color: m3.color.primary, paddingBottom: m3.spacing.s1 },
  formContent: { gap: deepSpaceSpacing.sm, padding: deepSpaceSpacing.md },
  fieldLabel: {
    color: m3.color.onSurfaceVariant,
    paddingBottom: m3.spacing.s1,
    marginTop: m3.spacing.s2,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s3 },
  saveError: { color: m3.color.error, paddingBottom: m3.spacing.s1 },
  saveButton: { alignSelf: "stretch", width: "100%" },
  listState: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  emptyContent: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: deepSpaceSpacing.sm,
    padding: deepSpaceSpacing.lg,
  },
  emptyText: {
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
    marginTop: deepSpaceSpacing.sm,
    marginBottom: m3.spacing.s2,
  },
  statusMark: { width: m3.spacing.s2, height: m3.spacing.s6 },
  sectionTitle: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  sectionCount: {
    color: m3.color.onSurfaceVariant,
    paddingBottom: m3.spacing.s1,
  },
  sectionRule: {
    flex: 1,
    height: m3.spacing.s1,
    backgroundColor: m3.color.outlineVariant,
  },
  itemSurface: { alignSelf: "stretch", marginBottom: m3.spacing.s3 },
  itemContent: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    padding: m3.spacing.s4,
  },
  itemStatus: { alignSelf: "stretch", width: m3.spacing.s1 },
  itemIconSurface: { flexShrink: 0 },
  itemIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  itemTitle: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  itemMeta: {
    color: m3.color.onSurfaceVariant,
    paddingBottom: m3.spacing.s1,
  },
});
