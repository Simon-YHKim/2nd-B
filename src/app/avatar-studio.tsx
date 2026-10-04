// The signed-in user's approved 64-cell avatar. Catalog PNGs are choice
// previews; the saved combination is always rendered from its specification.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Platform, ScrollView, StyleSheet, View } from "react-native";
import { PlainText as Text } from "@/components/ui/PlainText";
import { Image } from "expo-image";
import { Redirect, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";

import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PremiumLoadingState } from "@/components/premium";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAppRouter, useHardwareBack, useScreenParams } from "@/lib/nav/phone-embed";
import { useGoHome } from "@/lib/nav/go-home";
import {
  AVATAR_CATALOG,
  AVATAR_COLORS,
  DEFAULT_AVATAR_SPEC,
  getAnimalFurColors,
  getAvatarThumbnail,
  isAvatarAccessoryOccluded,
  resolveAvatarSpec,
  type AvatarSpec,
} from "@/lib/avatar";
import { fetchAvatarSpec, markAvatarSetupDeferredForSession, saveAvatarSpec } from "@/lib/supabase/avatar-spec";
import { m3 } from "@/lib/theme/m3";

type Category = "hair" | "accessory" | "face" | "expression" | "animal" | "job" | "garment" | "color";
type CatalogCategory = Exclude<Category, "color">;
type ColorField = "skin" | "hairColor" | "eye" | "cloth" | "cloth2" | "fur";
type CatalogItem = { id: string; ko: string; en: string; group?: string };

type Choice =
  | { kind: "catalog"; category: CatalogCategory; item: CatalogItem; key: string }
  | { kind: "clear"; category: "job" | "garment"; key: string }
  | { kind: "color"; field: ColorField; value: string; index: number; key: string };

const HUMAN_CATEGORIES: readonly Category[] = ["hair", "accessory", "face", "expression", "job", "garment", "color"];
const ANIMAL_CATEGORIES: readonly Category[] = ["animal", "accessory", "expression", "garment", "color"];
const HUMAN_COLOR_FIELDS: readonly ColorField[] = ["skin", "hairColor", "eye", "cloth", "cloth2"];
const ANIMAL_COLOR_FIELDS: readonly ColorField[] = ["fur", "eye", "cloth", "cloth2"];

function colorChoices(field: ColorField, species: string): readonly string[] {
  if (field === "hairColor") return AVATAR_COLORS.hair;
  if (field === "fur") return getAnimalFurColors(species);
  if (field === "cloth2") return AVATAR_COLORS.cloth;
  if (field === "cloth") {
    return [DEFAULT_AVATAR_SPEC.cloth, ...AVATAR_COLORS.cloth.filter((color) => color !== DEFAULT_AVATAR_SPEC.cloth)];
  }
  return AVATAR_COLORS[field];
}

function selectedId(spec: AvatarSpec, category: CatalogCategory): string | null {
  switch (category) {
    case "hair": return spec.hair;
    case "accessory": return spec.acc;
    case "face": return spec.face;
    case "expression": return spec.expr;
    case "animal": return spec.species;
    case "job": return spec.job;
    case "garment": return spec.garmentId;
  }
}

function choicesFor(category: Category, field: ColorField, species: string): Choice[] {
  if (category === "color") {
    return colorChoices(field, species).map((value, index) => ({
      kind: "color", field, value, index, key: `${field}:${value}`,
    }));
  }
  const catalog = AVATAR_CATALOG[category] as readonly CatalogItem[];
  const choices: Choice[] = catalog.map((item) => ({
    kind: "catalog", category, item, key: `${category}:${item.id}`,
  }));
  if (category === "job" || category === "garment") {
    choices.unshift({ kind: "clear", category, key: `${category}:default` });
  }
  return choices;
}

export default function AvatarStudioScreen() {
  // Phone-aware: inside the dashboard phone, leaving steps the phone's stack
  // and `setup` comes from the phone route (/avatar-studio?setup=1).
  const router = useAppRouter();
  const goHome = useGoHome();
  const { t, i18n } = useTranslation(["avatar", "common"]);
  const { setup } = useScreenParams<{ setup?: string }>();
  const setupMode = setup === "1";
  const {
    userId,
    hasProfile,
    profileProbeFailed,
    loading: authLoading,
    refresh: refreshAuth,
  } = useAuth();
  const [spec, setSpec] = useState<AvatarSpec>(DEFAULT_AVATAR_SPEC);
  const [category, setCategory] = useState<Category>("hair");
  const [colorField, setColorField] = useState<ColorField>("skin");
  const [loadState, setLoadState] = useState<{
    userId: string | null;
    status: "idle" | "loading" | "ready" | "error";
  }>({ userId: null, status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const activeUserIdRef = useRef(userId);
  const saveOperationRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const didFocusRef = useRef(false);
  activeUserIdRef.current = userId;

  const onCancel = useCallback(() => {
    if (saveInFlightRef.current) return;
    // A successful first profile setup is required. If the server read failed,
    // let the user leave the retry state instead of trapping the account.
    // The avatar is an optional profile choice (privacy policy: optional
    // profile fields never limit the service), so setup can always be left.
    // Leaving defers the prompt for this session only; nothing is written.
    if (setupMode) {
      if (userId) markAvatarSetupDeferredForSession(userId);
      goHome();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/profile");
  }, [goHome, loadState.status, router, setupMode, userId]);

  // Through the phone's claim stack inside the dashboard phone (see useHardwareBack).
  useHardwareBack(useCallback(() => {
    onCancel();
    return true;
  }, [onCancel]));

  // Re-read saved wardrobe choices when returning to this route.
  useFocusEffect(useCallback(() => {
    if (didFocusRef.current) setReloadKey((key) => key + 1);
    didFocusRef.current = true;
  }, []));

  useEffect(() => {
    saveOperationRef.current += 1;
    saveInFlightRef.current = false;
    setSaving(false);
    setSaveError(false);
    setSpec(DEFAULT_AVATAR_SPEC);
    if (!userId) {
      setLoadState({ userId: null, status: "idle" });
      return;
    }
    let alive = true;
    setLoadState({ userId, status: "loading" });
    void fetchAvatarSpec(userId)
      .then((saved) => {
        if (!alive || activeUserIdRef.current !== userId) return;
        const resolved = resolveAvatarSpec(saved ?? DEFAULT_AVATAR_SPEC);
        setSpec(resolved);
        setLoadState({ userId, status: "ready" });
      })
      .catch(() => {
        if (!alive || activeUserIdRef.current !== userId) return;
        setLoadState({ userId, status: "error" });
      });
    return () => { alive = false; saveOperationRef.current += 1; };
  }, [userId, reloadKey]);

  const readyForUser = loadState.userId === userId && loadState.status === "ready";
  const visibleCategories = spec.type === "animal" ? ANIMAL_CATEGORIES : HUMAN_CATEGORIES;
  const visibleColorFields = spec.type === "animal" ? ANIMAL_COLOR_FIELDS : HUMAN_COLOR_FIELDS;
  const activeCategory = visibleCategories.includes(category) ? category : spec.type === "animal" ? "animal" : "hair";
  const activeColorField = visibleColorFields.includes(colorField) ? colorField : spec.type === "animal" ? "fur" : "skin";
  const choices = useMemo(
    () => choicesFor(activeCategory, activeColorField, spec.species),
    [activeCategory, activeColorField, spec.species],
  );
  const koreanNames = i18n.resolvedLanguage?.startsWith("ko") || i18n.language.startsWith("ko");

  const patch = useCallback((change: Partial<AvatarSpec>) => {
    if (!readyForUser || saving) return;
    setSpec((current) => resolveAvatarSpec({ ...current, ...change }));
    setSaveError(false);
  }, [readyForUser, saving]);

  const selectChoice = useCallback((choice: Choice) => {
    if (choice.kind === "color") {
      patch({ [choice.field]: choice.value } as Partial<AvatarSpec>);
      return;
    }
    if (choice.kind === "clear") {
      if (choice.category === "job") patch({ job: null });
      else patch({ garmentId: null, wearUniform: true });
      return;
    }
    const id = choice.item.id;
    switch (choice.category) {
      case "hair": patch({ hair: id }); break;
      case "accessory": patch({ acc: id }); break;
      case "face": patch({ face: id }); break;
      case "expression": patch({ expr: id }); break;
      case "animal": patch({ type: "animal", species: id }); break;
      case "job": patch({ job: id, type: "human" }); break;
      case "garment": patch({ garmentId: id, wearUniform: false }); break;
    }
  }, [patch]);

  const onSave = useCallback(async () => {
    if (!userId || !readyForUser || saveInFlightRef.current) return;
    const saveUserId = userId;
    const operation = ++saveOperationRef.current;
    saveInFlightRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      await saveAvatarSpec(saveUserId, spec);
      if (saveOperationRef.current !== operation || activeUserIdRef.current !== saveUserId) return;
      saveInFlightRef.current = false;
      setSaving(false);
      if (setupMode) goHome();
      else if (router.canGoBack()) router.back();
      else router.replace("/profile");
    } catch {
      if (saveOperationRef.current !== operation || activeUserIdRef.current !== saveUserId) return;
      setSaveError(true);
    } finally {
      if (saveOperationRef.current === operation && activeUserIdRef.current === saveUserId) {
        saveInFlightRef.current = false;
        setSaving(false);
      }
    }
  }, [goHome, userId, readyForUser, router, spec, setupMode]);

  const isSelected = useCallback((choice: Choice): boolean => {
    if (choice.kind === "color") return spec[choice.field] === choice.value;
    if (choice.kind === "clear") return selectedId(spec, choice.category) === null;
    return selectedId(spec, choice.category) === choice.item.id;
  }, [spec]);

  const choiceLabel = useCallback((choice: Choice): string => {
    if (choice.kind === "color") {
      return t("avatar:colorChoice", {
        field: t(`avatar:colors.${choice.field}`), index: choice.index + 1,
      });
    }
    if (choice.kind === "clear") {
      return t(`avatar:${choice.category === "job" ? "noJob" : spec.type === "human" && spec.job ? "uniform" : "basicTee"}`);
    }
    return koreanNames ? choice.item.ko : choice.item.en;
  }, [koreanNames, spec.job, spec.type, t]);

  const renderChoice = useCallback(({ item }: { item: Choice }) => {
    const selected = isSelected(item);
    const label = choiceLabel(item);
    const thumbnail = item.kind === "catalog" ? getAvatarThumbnail(item.category, item.item.id) : null;
    return (
      <PixelPressable
        variant={selected ? "inset" : "bevel"}
        onPress={() => selectChoice(item)}
        disabled={saving}
        accessibilityLabel={label}
        accessibilityHint={item.kind === "catalog" ? t("avatar:sampleHint") : undefined}
        accessibilityState={{ selected }}
        rootStyle={styles.choiceSlot}
        style={styles.choiceCard}
        contentStyle={styles.choiceContent}
      >
        {item.kind === "color" ? (
          <View style={[styles.swatch, { backgroundColor: item.value }]} />
        ) : thumbnail ? (
          <Image source={thumbnail} style={styles.thumbnail} contentFit="contain" cachePolicy="memory-disk" />
        ) : (
          <View style={styles.thumbnail} />
        )}
        {item.kind === "catalog" ? <Text style={styles.sampleBadge}>{t("avatar:sample")}</Text> : null}
        <Text numberOfLines={2} style={[styles.choiceLabel, selected && styles.selectedText]}>{label}</Text>
      </PixelPressable>
    );
  }, [choiceLabel, isSelected, saving, selectChoice, t]);

  const title = t("avatar:title");
  const frame = (children: React.ReactNode) => (
    <DeepSpaceScreen active="settings" header="none" variant="museumLike" title={title} onBack={onCancel}>
      {children}
    </DeepSpaceScreen>
  );

  // Auth must settle before a signed-out redirect. A transient profile probe
  // failure is a retry state, not proof that the account lacks a profile.
  if (authLoading) return frame(<View style={styles.center}><PremiumLoadingState message={title} /></View>);
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false && profileProbeFailed) {
    return frame(<View style={styles.center} accessibilityRole="alert">
      <Text style={styles.errorText}>{t("common:errors.network")}</Text>
      <PixelPressable onPress={() => void refreshAuth()} contentStyle={styles.actionContent}>
        <Text style={styles.actionText}>{t("common:actions.retry")}</Text>
      </PixelPressable>
    </View>);
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (hasProfile !== true) return frame(<View style={styles.center}><PremiumLoadingState message={title} /></View>);
  if (loadState.userId === userId && loadState.status === "error") {
    return frame(<View style={styles.center} accessibilityRole="alert">
      <Text style={styles.errorText}>{t("avatar:loadError")}</Text>
      <PixelPressable onPress={() => setReloadKey((key) => key + 1)} contentStyle={styles.actionContent}>
        <Text style={styles.actionText}>{t("common:actions.retry")}</Text>
      </PixelPressable>
    </View>);
  }
  if (!readyForUser) return frame(<View style={styles.center}><PremiumLoadingState message={t("avatar:loading")} /></View>);

  return frame(
    <View style={styles.screen}>
      {setupMode ? <Text style={styles.setupHint}>{t("avatar:setupRequiredHint")}</Text> : null}
      <PixelSurface variant="inset" style={styles.previewFrame} contentStyle={styles.previewContent}>
        <AvatarPreview spec={spec} size={128} />
        <View style={styles.previewCopy}>
          <Text style={styles.previewTitle}>{t("avatar:preview")}</Text>
          <Text style={styles.previewHint}>{t("avatar:previewHint")}</Text>
        </View>
      </PixelSurface>

      <View style={styles.typeRow}>
        <Text style={styles.sectionLabel}>{t("avatar:selectType")}</Text>
        {(["human", "animal"] as const).map((type) => (
          <PixelPressable
            key={type}
            variant={spec.type === type ? "inset" : "bevel"}
            onPress={() => {
              if (type === "animal") {
                // The selected outfit belongs to both forms. A human job
                // uniform becomes dormant while the animal form is shown.
                patch({ type });
                setCategory("animal");
                setColorField("fur");
              } else {
                patch({ type });
                setCategory("hair");
                setColorField("skin");
              }
            }}
            disabled={saving}
            accessibilityLabel={t(`avatar:${type}`)}
            accessibilityState={{ selected: spec.type === type }}
            contentStyle={styles.typeContent}
          >
            <Text style={[styles.tabText, spec.type === type && styles.selectedText]}>{t(`avatar:${type}`)}</Text>
          </PixelPressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip} contentContainerStyle={styles.categoryRow}>
        {visibleCategories.map((entry) => (
          <PixelPressable
            key={entry}
            variant={activeCategory === entry ? "inset" : "bevel"}
            onPress={() => setCategory(entry)}
            disabled={saving}
            accessibilityLabel={t(`avatar:categories.${entry}`)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeCategory === entry }}
            contentStyle={styles.tabContent}
          >
            <Text style={[styles.tabText, activeCategory === entry && styles.selectedText]}>
              {t(`avatar:categories.${entry}`)}
            </Text>
          </PixelPressable>
        ))}
      </ScrollView>

      {activeCategory === "color" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip} contentContainerStyle={styles.colorFieldRow}>
          {visibleColorFields.map((entry) => (
            <PixelPressable
              key={entry}
              variant={activeColorField === entry ? "inset" : "bevel"}
              onPress={() => setColorField(entry)}
              disabled={saving}
              accessibilityLabel={t(`avatar:colors.${entry}`)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeColorField === entry }}
              contentStyle={styles.tabContent}
            >
              <Text style={[styles.tabText, activeColorField === entry && styles.selectedText]}>
                {t(`avatar:colors.${entry}`)}
              </Text>
            </PixelPressable>
          ))}
        </ScrollView>
      ) : null}

      <Text style={styles.categoryHint}>
        {activeCategory === "job" ? t("avatar:jobHint") :
          spec.type === "animal" ? t("avatar:animalHint") :
            activeCategory === "garment" ? t("avatar:garmentHint") :
              t("avatar:choiceCount", { count: choices.length })}
      </Text>
      <Text style={styles.sampleHint}>{t("avatar:sampleHint")}</Text>
      {isAvatarAccessoryOccluded(spec) ? (
        <Text accessibilityRole="alert" style={styles.occludedHint}>{t("avatar:occludedHint")}</Text>
      ) : null}

      <FlatList
        key={`${spec.type}:${activeCategory}:${activeColorField}`}
        data={choices}
        renderItem={renderChoice}
        keyExtractor={(item) => item.key}
        numColumns={3}
        columnWrapperStyle={styles.choiceRow}
        contentContainerStyle={styles.listContent}
        extraData={spec}
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
      />

      <View style={styles.footer}>
        {saveError ? <Text accessibilityRole="alert" style={styles.errorText}>{t("avatar:saveError")}</Text> : null}
        <PixelPressable
          variant="bevel"
          fullWidth
          disabled={saving || !readyForUser}
          onPress={() => void onSave()}
          accessibilityLabel={t("avatar:save")}
          accessibilityState={{ busy: saving }}
          contentStyle={styles.saveContent}
        >
          <Text style={styles.saveText}>{saving ? t("avatar:saving") : t("avatar:save")}</Text>
        </PixelPressable>
        {setupMode ? (
          <PixelPressable
            variant="inset"
            fullWidth
            disabled={saving}
            onPress={onCancel}
            accessibilityLabel={t("avatar:setupLater")}
            contentStyle={styles.saveContent}
          >
            <Text style={styles.saveText}>{t("avatar:setupLater")}</Text>
          </PixelPressable>
        ) : null}
      </View>
    </View>,
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: m3.spacing.s4, paddingBottom: m3.spacing.s4, gap: m3.spacing.s2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: m3.spacing.s4, padding: m3.spacing.s6 },
  previewFrame: { alignSelf: "stretch" },
  setupHint: { color: m3.color.onSurface, fontSize: m3.type.bodyMedium.size, lineHeight: m3.type.bodyMedium.line, paddingBottom: m3.spacing.s1 },
  previewContent: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s4, padding: m3.spacing.s2 },
  previewCopy: { flex: 1, gap: m3.spacing.s2 },
  previewTitle: { color: m3.color.onSurface, fontSize: m3.type.titleMedium.size, lineHeight: m3.type.titleMedium.line, paddingBottom: m3.spacing.s1 },
  previewHint: { color: m3.color.onSurfaceVariant, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  sectionLabel: { color: m3.color.onSurfaceVariant, fontSize: m3.type.labelMedium.size, lineHeight: m3.type.labelMedium.line, paddingBottom: m3.spacing.s1, marginRight: m3.spacing.s2 },
  typeContent: { minHeight: m3.minTouch, minWidth: m3.minTouch + m3.spacing.s8, alignItems: "center", paddingHorizontal: m3.spacing.s3 },
  // D-08: a horizontal ScrollView inside a height-bounded column shrinks when the
  // FlatList below overflows (Android measured 28.6dp of the 64dp row). Hold its
  // own height so the tabs and their touch targets stay whole.
  tabStrip: { flexGrow: 0, flexShrink: 0 },
  categoryRow: { flexDirection: "row", gap: m3.spacing.s2, paddingVertical: m3.spacing.s2 },
  colorFieldRow: { flexDirection: "row", gap: m3.spacing.s2, paddingVertical: m3.spacing.s1 },
  tabContent: { minHeight: m3.minTouch, alignItems: "center", paddingHorizontal: m3.spacing.s3 },
  tabText: { color: m3.color.onSurface, fontSize: m3.type.labelMedium.size, lineHeight: m3.type.labelMedium.line, paddingBottom: m3.spacing.s1 },
  selectedText: { color: m3.color.primary },
  categoryHint: { color: m3.color.onSurfaceVariant, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  listContent: { paddingBottom: m3.spacing.s4, gap: m3.spacing.s3 },
  choiceRow: { justifyContent: "space-between", gap: m3.spacing.s2 },
  choiceSlot: { width: "32%" },
  choiceCard: { flex: 1 },
  choiceContent: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: m3.spacing.s1, padding: m3.spacing.s2 },
  thumbnail: { width: 64, height: 64 },
  swatch: { width: 48, height: 48 },
  sampleBadge: { color: m3.color.onSurfaceVariant, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  sampleHint: { color: m3.color.onSurfaceVariant, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  occludedHint: { color: m3.color.tertiary, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  choiceLabel: { color: m3.color.onSurface, textAlign: "center", fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  footer: { gap: m3.spacing.s2 },
  saveContent: { minHeight: m3.minTouch, alignItems: "center", paddingVertical: m3.spacing.s2 },
  saveText: { color: m3.color.onSurface, fontSize: m3.type.labelLarge.size, lineHeight: m3.type.labelLarge.line, paddingBottom: m3.spacing.s1 },
  errorText: { color: m3.color.error, fontSize: m3.type.bodyMedium.size, lineHeight: m3.type.bodyMedium.line, paddingBottom: m3.spacing.s1 },
  actionContent: { minHeight: m3.minTouch, paddingHorizontal: m3.spacing.s4 },
  actionText: { color: m3.color.onSurface, fontSize: m3.type.labelMedium.size, lineHeight: m3.type.labelMedium.line, paddingBottom: m3.spacing.s1 },
});
