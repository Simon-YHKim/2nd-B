import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdChip } from "@/components/m3";
import { PremiumLoadingState, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import {
  AVATAR_ACCESSORIES,
  AVATAR_ANIMALS,
  AVATAR_CLOTH_COLORS,
  AVATAR_EYE_COLORS,
  AVATAR_EXPRESSIONS,
  AVATAR_FACE_DETAILS,
  AVATAR_FUR_COLORS,
  AVATAR_HAIR,
  AVATAR_HAIR_COLORS,
  AVATAR_SKIN_COLORS,
  Avatar64,
  createAvatarSpec,
  type AvatarCatalogItem,
} from "@/lib/avatar/Avatar64";
import { avatarJobForOccupation, type ProfileAvatar } from "@/lib/avatar/profile-avatar";
import { useAuth } from "@/lib/auth/AuthContext";
import { fetchProfileAvatar, saveProfileCharacter } from "@/lib/supabase/avatar";
import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

type StudioTab = "shape" | "color";
type CategoryKey =
  | "type"
  | "hair"
  | "expr"
  | "face"
  | "acc"
  | "species"
  | "skin"
  | "hairColor"
  | "eye"
  | "cloth"
  | "fur";

interface Category {
  key: CategoryKey;
  label: string;
}

interface StudioOption {
  id: string;
  label: string;
  color?: string;
}

function catalogLabel(item: AvatarCatalogItem, language: string): string {
  return language.startsWith("ko") ? item.ko : item.en;
}

export default function ProfileCharacterScreen() {
  const { t, i18n } = useTranslation("profile");
  const { userId, hasProfile, loading: authLoading } = useAuth();
  const [avatar, setAvatar] = useState<ProfileAvatar | null>(null);
  const [occupation, setOccupation] = useState<string | undefined>();
  const [tab, setTab] = useState<StudioTab>("shape");
  const [category, setCategory] = useState<CategoryKey>("type");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchProfileAvatar(userId).then((state) => {
      if (!alive) return;
      setAvatar(state.avatar ?? createAvatarSpec(userId, { job: null }));
      setOccupation(state.occupation);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const language = i18n.resolvedLanguage ?? i18n.language;
  const isAnimal = avatar?.type === "animal";

  const shapeCategories = useMemo<readonly Category[]>(
    () =>
      isAnimal
        ? [
            { key: "type", label: t("avatar.character.type") },
            { key: "species", label: t("avatar.character.species") },
            { key: "expr", label: t("avatar.character.expression") },
            { key: "acc", label: t("avatar.character.accessory") },
          ]
        : [
            { key: "type", label: t("avatar.character.type") },
            { key: "hair", label: t("avatar.character.hair") },
            { key: "expr", label: t("avatar.character.expression") },
            { key: "face", label: t("avatar.character.face") },
            { key: "acc", label: t("avatar.character.accessory") },
          ],
    [isAnimal, t],
  );

  const colorCategories = useMemo<readonly Category[]>(
    () =>
      isAnimal
        ? [
            { key: "fur", label: t("avatar.character.furColor") },
            { key: "eye", label: t("avatar.character.eyeColor") },
            { key: "cloth", label: t("avatar.character.clothesColor") },
          ]
        : [
            { key: "skin", label: t("avatar.character.skinColor") },
            { key: "hairColor", label: t("avatar.character.hairColor") },
            { key: "eye", label: t("avatar.character.eyeColor") },
            { key: "cloth", label: t("avatar.character.clothesColor") },
          ],
    [isAnimal, t],
  );

  const categories = tab === "shape" ? shapeCategories : colorCategories;
  const activeCategory = categories.some((item) => item.key === category)
    ? category
    : categories[0].key;

  const options = useMemo<readonly StudioOption[]>(() => {
    const fromCatalog = (items: readonly AvatarCatalogItem[]) =>
      items.map((item) => ({ id: item.id, label: catalogLabel(item, language) }));
    const fromColors = (items: readonly string[], label: string) =>
      items.map((color, index) => ({ id: color, color, label: `${label} ${index + 1}` }));

    switch (activeCategory) {
      case "type":
        return [
          { id: "human", label: t("avatar.character.human") },
          { id: "animal", label: t("avatar.character.animal") },
        ];
      case "hair":
        return fromCatalog(AVATAR_HAIR);
      case "expr":
        return fromCatalog(AVATAR_EXPRESSIONS);
      case "face":
        return fromCatalog(AVATAR_FACE_DETAILS);
      case "acc":
        return fromCatalog(AVATAR_ACCESSORIES);
      case "species":
        return fromCatalog(AVATAR_ANIMALS);
      case "skin":
        return fromColors(AVATAR_SKIN_COLORS, t("avatar.character.skinColor"));
      case "hairColor":
        return fromColors(AVATAR_HAIR_COLORS, t("avatar.character.hairColor"));
      case "eye":
        return fromColors(AVATAR_EYE_COLORS, t("avatar.character.eyeColor"));
      case "cloth":
        return fromColors(AVATAR_CLOTH_COLORS, t("avatar.character.clothesColor"));
      case "fur":
        return fromColors(AVATAR_FUR_COLORS, t("avatar.character.furColor"));
    }
  }, [activeCategory, language, t]);

  const previewFor = useCallback(
    (option: StudioOption): ProfileAvatar | null => {
      if (!avatar) return null;
      if (activeCategory === "type") {
        const type = option.id === "animal" ? "animal" : "human";
        return {
          ...avatar,
          type,
          job: type === "human" ? avatarJobForOccupation(occupation) : null,
        };
      }
      return { ...avatar, [activeCategory]: option.id } as ProfileAvatar;
    },
    [activeCategory, avatar, occupation],
  );

  const choose = useCallback(
    (option: StudioOption) => {
      const next = previewFor(option);
      if (!next) return;
      setAvatar(next);
      if (activeCategory === "type") {
        setCategory(next.type === "animal" ? "species" : "hair");
      }
    },
    [activeCategory, previewFor],
  );

  const selectTab = useCallback(
    (next: StudioTab) => {
      setTab(next);
      const nextCategories = next === "shape" ? shapeCategories : colorCategories;
      setCategory(nextCategories[0].key);
    },
    [colorCategories, shapeCategories],
  );

  const onSave = useCallback(async () => {
    if (!avatar || saving) return;
    setSaving(true);
    try {
      const saved = await saveProfileCharacter(avatar, avatar.seed);
      setAvatar(saved);
      setToast({ message: t("avatar.character.saved"), tone: "success" });
    } catch {
      setToast({ message: t("avatar.character.saveError"), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }, [avatar, saving, t]);

  const title = t("avatar.character.screenTitle");
  if (authLoading || hasProfile !== true || loading) {
    return (
      <DeepSpaceScreen
        active="account"
        header="none"
        variant="museumLike"
        title={title}
        onBack={() => router.back()}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={title} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (!avatar) return null;

  return (
    <DeepSpaceScreen
      active="account"
      header="none"
      variant="museumLike"
      title={title}
      onBack={() => router.back()}
    >
      <FlatList
        key={`${tab}:${activeCategory}`}
        data={options}
        numColumns={3}
        keyExtractor={(item) => item.id}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.optionRow}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{t("avatar.character.eyebrow")}</Text>
            <Text style={styles.title}>{t("avatar.character.title")}</Text>
            <Text style={styles.intro}>{t("avatar.character.intro")}</Text>
            <View
              style={styles.previewCard}
              accessible
              accessibilityLabel={t("avatar.character.previewLabel")}
            >
              <Text style={styles.previewLabel}>{t("avatar.character.previewLabel")}</Text>
              <Avatar64
                spec={avatar}
                size={128}
                accessibilityLabel={t("avatar.character.previewLabel")}
              />
            </View>
            <View style={styles.tabs}>
              <MdChip
                kind="filter"
                label={t("avatar.character.shapeTab")}
                selected={tab === "shape"}
                onPress={() => selectTab("shape")}
              />
              <MdChip
                kind="filter"
                label={t("avatar.character.colorTab")}
                selected={tab === "color"}
                onPress={() => selectTab("color")}
              />
            </View>
            <View style={styles.categories}>
              {categories.map((item) => (
                <MdChip
                  key={item.key}
                  kind="filter"
                  label={item.label}
                  selected={item.key === activeCategory}
                  onPress={() => setCategory(item.key)}
                />
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const selected = avatar[activeCategory] === item.id;
          const preview = previewFor(item);
          return (
            <TouchableOpacity
              activeOpacity={0.72}
              onPress={() => choose(item)}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={
                selected ? t("avatar.character.optionSelected", { name: item.label }) : item.label
              }
            >
              {item.color ? (
                <View style={[styles.swatch, { backgroundColor: item.color }]} />
              ) : preview ? (
                <Avatar64 spec={preview} size={56} />
              ) : null}
              <Text style={styles.optionLabel} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <MdButton
              variant="filled"
              label={saving ? t("avatar.character.saving") : t("avatar.character.save")}
              loading={saving}
              onPress={() => void onSave()}
            />
            <MdButton
              variant="outlined"
              label={t("avatar.character.nextRole")}
              disabled={avatar.type === "animal"}
              accessibilityHint={
                avatar.type === "animal" ? t("avatar.character.roleForHumanOnly") : undefined
              }
              onPress={() => router.push("/avatar")}
            />
            {avatar.type === "animal" ? (
              <Text style={styles.notice}>{t("avatar.character.roleForHumanOnly")}</Text>
            ) : null}
          </View>
        }
      />
      {toast ? <PremiumToast message={toast.message} tone={toast.tone} /> : null}
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: {
    padding: deepSpaceSpacing.lg,
    paddingBottom: 56,
    gap: deepSpaceSpacing.sm,
  },
  header: { gap: deepSpaceSpacing.md, marginBottom: deepSpaceSpacing.sm },
  eyebrow: { color: deepSpace.accentSoft, fontSize: 12 },
  title: { color: deepSpace.textHi, fontSize: 20 },
  intro: { color: deepSpace.textMid, fontSize: 13, lineHeight: 20 },
  previewCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: deepSpaceSpacing.sm,
    padding: deepSpaceSpacing.md,
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLineStrong,
    borderWidth: 1,
    borderRadius: m3.shape.none,
  },
  previewLabel: { color: deepSpace.textLo, fontSize: 12 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: deepSpaceSpacing.sm },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: deepSpaceSpacing.sm },
  optionRow: { gap: deepSpaceSpacing.sm },
  option: {
    flex: 1,
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
    gap: deepSpaceSpacing.xs,
    padding: deepSpaceSpacing.sm,
    marginBottom: deepSpaceSpacing.sm,
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: m3.shape.none,
  },
  optionSelected: { backgroundColor: deepSpace.cardPressed, borderColor: deepSpace.accent },
  swatch: {
    width: 48,
    height: 48,
    borderColor: deepSpace.cardLineStrong,
    borderWidth: 2,
    borderRadius: m3.shape.none,
  },
  optionLabel: { color: deepSpace.textHi, fontSize: 11, lineHeight: 15, textAlign: "center" },
  footer: { gap: deepSpaceSpacing.sm, paddingTop: deepSpaceSpacing.md },
  notice: { color: deepSpace.warning, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
