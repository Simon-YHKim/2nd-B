// 휴식 담기 (rev2 P4e): the rest domain lens. recreation_items (0059) had a
// writer with NO screen — like the people map, this is the star's first real
// data path. A want/active/done board of the things that recharge you, plus a
// small add form. The 휴식 star's brightness folds recreation_items.
// (Health/growth/finance already have structured inputs via the ops kit:
// /meals, /growth, /ledger — rest was the remaining gap.)
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

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

const CATEGORY_LABEL: Record<RecreationCategory, { en: string; ko: string }> = {
  game: { en: "Game", ko: "게임" },
  movie: { en: "Movie", ko: "영화" },
  music: { en: "Music", ko: "음악" },
  travel: { en: "Travel", ko: "여행" },
  show: { en: "Show", ko: "공연" },
  hobby: { en: "Hobby", ko: "취미" },
  other: { en: "Other", ko: "그 밖에" },
};

const STATUS_LABEL: Record<RecreationStatus, { en: string; ko: string }> = {
  want: { en: "Want to", ko: "하고 싶어요" },
  active: { en: "Doing", ko: "하는 중" },
  done: { en: "Done", ko: "했어요" },
};

const STATUS_ORDER: readonly RecreationStatus[] = ["active", "want", "done"];
const CATEGORIES: readonly RecreationCategory[] = ["game", "movie", "music", "travel", "show", "hobby", "other"];

export default function RestScreen() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const isKo = locale === "ko";

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
      <DeepSpaceScreen active="lens">
        <View style={styles.center}>
          <PremiumLoadingState message={isKo ? "불러오는 중이에요…" : "Loading…"} />
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
    <DeepSpaceScreen active="lens">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headRow}>
          <Text variant="heading" style={{ flex: 1 }}>
            {isKo ? "휴식" : "Rest"}
          </Text>
          <MdButton
            variant="tonal"
            label={adding ? (isKo ? "닫기" : "Close") : isKo ? "휴식 담기" : "Add rest"}
            onPress={() => setAdding((v) => !v)}
          />
        </View>

        {adding ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Field
              label={isKo ? "무엇인가요? (필수)" : "What is it? (required)"}
              value={title}
              onChangeText={setTitle}
              placeholder={isKo ? "예: 젤다, 제주 여행, 피아노" : "e.g. Zelda, Jeju trip, piano"}
            />
            <Text variant="caption" color="textMuted">
              {isKo ? "종류" : "Category"}
            </Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((c) => (
                <MdChip
                  key={c}
                  kind="filter"
                  label={CATEGORY_LABEL[c][locale]}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
            <Text variant="caption" color="textMuted">
              {isKo ? "상태" : "Status"}
            </Text>
            <SegBtn
              segments={STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s][locale] }))}
              selected={[status]}
              onSelect={(key) => setStatus(key as RecreationStatus)}
            />
            {saveFailed ? (
              <Text variant="caption" color="textSubtle">
                {isKo ? "저장하지 못했어요. 다시 시도해 주세요." : "Could not save. Please try again."}
              </Text>
            ) : null}
            <MdButton
              variant="filled"
              disabled={!title.trim() || saving}
              label={saving ? (isKo ? "저장 중…" : "Saving…") : isKo ? "담기" : "Save"}
              onPress={handleAdd}
            />
          </MdCard>
        ) : null}

        {items === null ? (
          <PremiumLoadingState message={isKo ? "펼치는 중…" : "Opening…"} />
        ) : items.length === 0 ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {isKo
                ? "아직 담긴 휴식이 없어요. 요즘 나를 쉬게 하는 것부터 담아 보세요. 휴식 별이 밝아져요."
                : "Nothing here yet. Start with what recharges you these days; the rest star brightens."}
            </Text>
          </MdCard>
        ) : (
          STATUS_ORDER.map((s) => {
            const group = byStatus.get(s) ?? [];
            if (group.length === 0) return null;
            return (
              <View key={s} style={styles.group}>
                <Text variant="caption" color="textMuted" style={styles.groupLabel}>
                  {STATUS_LABEL[s][locale]} · {group.length}
                </Text>
                {group.map((item) => (
                  <MdCard key={item.id} variant="outlined" style={styles.entry}>
                    <View style={[styles.entryDot, s === "done" ? styles.entryDotDone : s === "active" ? styles.entryDotActive : null]} />
                    <View style={{ flex: 1 }}>
                      <Text variant="body" numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text variant="caption" color="textMuted">
                        {CATEGORY_LABEL[item.category][locale]}
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
