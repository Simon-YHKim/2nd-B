// 휴식 담기 (rev2 P4e): the rest domain lens. recreation_items (0059) had a
// writer with NO screen — like the people map, this is the star's first real
// data path. A want/active/done board of the things that recharge you, plus a
// small add form. The 휴식 star's brightness folds recreation_items.
// (Health/growth/finance already have structured inputs via the ops kit:
// /meals, /growth, /ledger — rest was the remaining gap.)
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip, SegBtn } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import {
  createRecreationItem,
  listRecreationItems,
  type RecreationCategory,
  type RecreationItem,
  type RecreationStatus,
} from "@/lib/recreation/items";

const STATUS_ORDER: readonly RecreationStatus[] = ["active", "want", "done"];
const CATEGORIES: readonly RecreationCategory[] = ["game", "movie", "music", "travel", "show", "hobby", "other"];

export default function RestScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading } = useAuth();

  const [items, setItems] = useState<RecreationItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<RecreationCategory>("hobby");
  const [status, setStatus] = useState<RecreationStatus>("want");

  const refresh = useCallback(() => {
    if (!userId) return;
    listRecreationItems(userId)
      .then(setItems)
      .catch((e) => {
        console.warn("[rest] list failed", (e as Error).message);
        setItems([]);
      });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byStatus = useMemo(() => {
    const groups = new Map<RecreationStatus, RecreationItem[]>();
    for (const s of STATUS_ORDER) groups.set(s, []);
    for (const item of items ?? []) {
      groups.get(item.status)?.push(item);
    }
    return groups;
  }, [items]);

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:rest.title")} onBack={() => router.back()}>
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
      await createRecreationItem(userId, { title: title.trim(), category, status });
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

  return (
    <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:rest.title")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headRow}>
          <Text variant="heading" style={{ flex: 1 }}>
            {t("deepspace:rest.title")}
          </Text>
          <MdButton
            variant="tonal"
            label={adding ? t("deepspace:rest.close") : t("deepspace:rest.addRest")}
            onPress={() => setAdding((v) => !v)}
          />
        </View>

        {adding ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Field
              label={t("deepspace:rest.whatLabel")}
              value={title}
              onChangeText={setTitle}
              placeholder={t("deepspace:rest.whatPlaceholder")}
            />
            <Text variant="caption" color="textMuted">
              {t("deepspace:rest.categoryLabel")}
            </Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((c) => (
                <MdChip
                  key={c}
                  kind="filter"
                  label={t(`deepspace:rest.category.${c}`)}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
            <Text variant="caption" color="textMuted">
              {t("deepspace:rest.statusLabel")}
            </Text>
            <SegBtn
              segments={STATUS_ORDER.map((s) => ({ key: s, label: t(`deepspace:rest.status.${s}`) }))}
              selected={[status]}
              onSelect={(key) => setStatus(key as RecreationStatus)}
            />
            {saveFailed ? (
              <Text variant="caption" color="textSubtle">
                {t("deepspace:rest.saveFailed")}
              </Text>
            ) : null}
            <MdButton
              variant="filled"
              disabled={!title.trim() || saving}
              label={saving ? t("deepspace:rest.saving") : t("deepspace:rest.save")}
              onPress={handleAdd}
            />
          </MdCard>
        ) : null}

        {items === null ? (
          <PremiumLoadingState message={t("deepspace:rest.opening")} />
        ) : items.length === 0 ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {t("deepspace:rest.empty")}
            </Text>
          </MdCard>
        ) : (
          STATUS_ORDER.map((s) => {
            const group = byStatus.get(s) ?? [];
            if (group.length === 0) return null;
            return (
              <View key={s} style={styles.group}>
                <Text variant="caption" color="textMuted" style={styles.groupLabel}>
                  {t(`deepspace:rest.status.${s}`)} · {group.length}
                </Text>
                {group.map((item) => (
                  <MdCard key={item.id} variant="outlined" style={styles.entry}>
                    <View style={[styles.entryDot, s === "done" ? styles.entryDotDone : s === "active" ? styles.entryDotActive : null]} />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text variant="caption" color="textMuted">
                        {t(`deepspace:rest.category.${item.category}`)}
                        {item.occurred_on ? ` · ${item.occurred_on}` : ""}
                        {item.rating ? ` · ${"★".repeat(Math.min(5, item.rating))}` : ""}
                      </Text>
                    </View>
                  </MdCard>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardPad: { padding: spacing.md, gap: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  group: { gap: spacing.sm },
  groupLabel: { marginTop: 2 },
  entry: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  entryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: withAlpha(m3.accent.starDim, 0.7) },
  entryDotActive: { backgroundColor: m3.accent.starCore },
  entryDotDone: { backgroundColor: m3.accent.moodPositive },
});
