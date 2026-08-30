// 관계 사람 지도: relation_people의 owner-scoped 실제 읽기/쓰기 화면.
//
// 디자인 번들의 PeopleMapScreen은 샘플 상태라 이식하지 않는다. 실제 사람은
// 가까울수록 중심에 놓고 관계 종류는 색으로만 구분한다. 한 번에 12명만 그려
// SVG 노드 수를 제한하고, 각 rect 노드에는 별도의 44dp Pressable을 겹친다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import Svg, { Rect } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field } from "@/components/m3";
import { m3TextStyle } from "@/components/m3/typeface";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PremiumLoadingState } from "@/components/premium";
import { createLatestWins } from "@/lib/async/latest-wins";
import { useAuth } from "@/lib/auth/AuthContext";
import { createPerson, listPeople, type Person, type RelationKind } from "@/lib/relation/people";
import { RELATION_SECTORS } from "@/lib/relation/people-map-layout";
import {
  layoutPeoplePage,
  peoplePageCapacity,
  PEOPLE_NODE_TARGET_SIZE,
  type PeoplePageNode,
} from "@/lib/relation/people-page-layout";
import { useFontStyle } from "@/lib/settings/readable-font";
import { m3 } from "@/lib/theme/m3";
import { deepSpaceSpacing } from "@/lib/theme/tokens";
import { useKeyboard } from "@/lib/ui/useKeyboard";

const MAP_CANVAS = 1000;
const MAP_CENTER = MAP_CANVAS / 2;
const NODE_SIZE = 28;
const ORBIT_MARK_SIZE = 10;
const ORBIT_RADII = [160, 310, 460] as const;
const ORBIT_POINTS_PER_RING = 12;

// Three rings x twelve rects. This count never grows with relation_people rows.
const ORBIT_POINTS = ORBIT_RADII.flatMap((radius) =>
  Array.from({ length: ORBIT_POINTS_PER_RING }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / ORBIT_POINTS_PER_RING;
    return {
      x: Math.round(MAP_CENTER + Math.cos(angle) * radius),
      y: Math.round(MAP_CENTER + Math.sin(angle) * radius),
    };
  }),
);

const KIND_COLOR: Readonly<Record<RelationKind, string>> = {
  family: m3.accent.moodPositive,
  partner: m3.accent.moodNegative,
  friend: m3.accent.starCore,
  colleague: m3.accent.star,
  mentor: m3.accent.polaris,
  other: m3.color.onSurfaceVariant,
};

function returnToRelationStar() {
  if (router.canGoBack()) router.back();
  else router.replace("/star/relation");
}

function mergeConfirmedPeople(
  fetchedPeople: readonly Person[],
  confirmedPeople: ReadonlyMap<string, Person>,
): Person[] {
  // Newest locally confirmed write stays first until this owner-scoped child
  // unmounts. A failed or lagging reconciliation read cannot erase it.
  const confirmed = Array.from(confirmedPeople.values()).reverse();
  const confirmedIds = new Set(confirmed.map((person) => person.id));
  return [...confirmed, ...fetchedPeople.filter((person) => !confirmedIds.has(person.id))];
}

export default function PeopleMapScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading } = useAuth();

  useEffect(() => {
    if (!loading) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      returnToRelationStar();
      return true;
    });
    return () => subscription.remove();
  }, [loading]);

  if (loading) {
    return (
      <DeepSpaceScreen
        active="chat"
        header="none"
        variant="museumLike"
        title={t("deepspace:people.title")}
        onBack={returnToRelationStar}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={t("deepspace:people.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // AuthContext can move directly from account A to B. Remounting before paint
  // isolates list, selection, form draft, and every pending async generation.
  return <PeopleContent key={userId} userId={userId} />;
}

function PeopleContent({ userId }: { userId: string }) {
  const { t } = useTranslation(["deepspace", "common"]);
  const keyboardHeight = useKeyboard();
  useFontStyle();

  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RelationKind>("friend");
  const [closeness, setCloseness] = useState(3);
  const [mapSize, setMapSize] = useState(0);
  const loadGuardRef = useRef(createLatestWins());
  const saveGuardRef = useRef(createLatestWins());
  const confirmedPeopleRef = useRef(new Map<string, Person>());

  const refresh = useCallback(async () => {
    const token = loadGuardRef.current.begin();
    try {
      const fetchedPeople = await listPeople(userId);
      if (loadGuardRef.current.isStale(token)) return;
      setPeople(mergeConfirmedPeople(fetchedPeople, confirmedPeopleRef.current));
      setLoadFailed(false);
    } catch (error) {
      if (loadGuardRef.current.isStale(token)) return;
      // A read error is not an empty account. Existing rows remain on screen
      // when only a background reconciliation fails.
      console.warn("[people] list failed", (error as Error).message);
      setLoadFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    return () => {
      loadGuardRef.current.begin();
      saveGuardRef.current.begin();
    };
  }, [refresh]);

  const pageCapacity = peoplePageCapacity(mapSize);
  const pageCount = Math.max(1, Math.ceil((people?.length ?? 0) / pageCapacity));

  useEffect(() => {
    if (page >= pageCount) {
      setSelectedId(null);
      setPage(pageCount - 1);
    }
  }, [page, pageCount]);

  const pagePeople = useMemo(
    () => (people ?? []).slice(page * pageCapacity, (page + 1) * pageCapacity),
    [page, pageCapacity, people],
  );
  const peopleById = useMemo(
    () => new Map(pagePeople.map((person) => [person.id, person])),
    [pagePeople],
  );
  const nodes = useMemo(() => layoutPeoplePage(pagePeople, mapSize), [mapSize, pagePeople]);
  const selected = useMemo(
    () => pagePeople.find((person) => person.id === selectedId) ?? null,
    [pagePeople, selectedId],
  );

  const closeForm = useCallback(() => {
    if (saving) return;
    setAdding(false);
    setSaveFailed(false);
  }, [saving]);

  const handleBack = useCallback(() => {
    if (adding) {
      closeForm();
      return;
    }
    if (selectedId) {
      setSelectedId(null);
      return;
    }
    returnToRelationStar();
  }, [adding, closeForm, selectedId]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  const openOrCloseForm = useCallback(() => {
    if (adding) {
      closeForm();
      return;
    }
    setSelectedId(null);
    setSaveFailed(false);
    setAdding(true);
  }, [adding, closeForm]);

  async function handleAdd() {
    if (!name.trim() || saving) return;
    const token = saveGuardRef.current.begin();
    setSaving(true);
    setSaveFailed(false);
    try {
      const createdPerson = await createPerson(userId, {
        display_name: name.trim(),
        relation_kind: kind,
        closeness,
      });
      if (saveGuardRef.current.isStale(token)) return;

      confirmedPeopleRef.current.set(createdPerson.id, createdPerson);
      setPeople((currentPeople) =>
        mergeConfirmedPeople(currentPeople ?? [], confirmedPeopleRef.current),
      );
      setName("");
      setKind("friend");
      setCloseness(3);
      setPage(0);
      setAdding(false);
      setSelectedId(createdPerson.id);
      void refresh();
    } catch (error) {
      if (saveGuardRef.current.isStale(token)) return;
      console.warn("[people] save failed", (error as Error).message);
      setSaveFailed(true);
    } finally {
      if (!saveGuardRef.current.isStale(token)) setSaving(false);
    }
  }

  function selectPage(nextPage: number) {
    setSelectedId(null);
    setPage(nextPage);
  }

  function nodeAccessibilityLabel(node: PeoplePageNode): string {
    const person = peopleById.get(node.id);
    const personCloseness = person?.closeness ?? "-";
    return [
      node.name,
      t(`deepspace:people.kind.${node.kind}`),
      t("deepspace:people.closeness", { closeness: personCloseness }),
    ].join(", ");
  }

  const addLabel = adding ? t("deepspace:people.close") : t("deepspace:people.addPerson");

  const loadErrorSurface = (
    <PixelSurface variant="inset" contentStyle={styles.errorContent}>
      <PixelGlyph name="warning" color={m3.color.error} size={24} />
      <View style={styles.errorCopy}>
        <RNText accessibilityRole="alert" style={[m3TextStyle("bodyMedium"), styles.errorText]}>
          {t("common:errors.network")}
        </RNText>
        <PixelPressable
          variant="bevel"
          onPress={() => void refresh()}
          accessibilityLabel={t("common:actions.retry")}
          contentStyle={styles.smallActionContent}
        >
          <PixelGlyph name="refresh" color={m3.color.primary} size={24} />
          <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
            {t("common:actions.retry")}
          </RNText>
        </PixelPressable>
      </View>
    </PixelSurface>
  );

  const mapSurface = (
    <>
      <PixelSurface variant="inset" style={styles.mapSurface} contentStyle={styles.mapContent}>
        <View
          style={styles.mapStage}
          onLayout={(event) => {
            const nextSize = Math.round(event.nativeEvent.layout.width);
            if (nextSize !== mapSize) setMapSize(nextSize);
          }}
        >
          <Svg
            pointerEvents="none"
            style={styles.mapSvg}
            viewBox={`0 0 ${MAP_CANVAS} ${MAP_CANVAS}`}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {ORBIT_POINTS.map((point, index) => (
              <Rect
                key={`orbit-${index}`}
                x={point.x - ORBIT_MARK_SIZE / 2}
                y={point.y - ORBIT_MARK_SIZE / 2}
                width={ORBIT_MARK_SIZE}
                height={ORBIT_MARK_SIZE}
                fill={m3.color.outlineVariant}
              />
            ))}
            <Rect
              x={MAP_CENTER - NODE_SIZE / 2}
              y={MAP_CENTER - NODE_SIZE / 2}
              width={NODE_SIZE}
              height={NODE_SIZE}
              fill={m3.accent.polaris}
            />
            {nodes.map((node) => {
              const x = Math.round(node.x * MAP_CANVAS) - NODE_SIZE / 2;
              const y = Math.round(node.y * MAP_CANVAS) - NODE_SIZE / 2;
              const isSelected = node.id === selectedId;
              return (
                <Rect
                  key={`node-${node.id}`}
                  x={x}
                  y={y}
                  width={NODE_SIZE}
                  height={NODE_SIZE}
                  fill={KIND_COLOR[node.kind]}
                  stroke={isSelected ? m3.color.onSurface : undefined}
                  strokeWidth={isSelected ? 6 : undefined}
                />
              );
            })}
          </Svg>

          {mapSize > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.meLabel,
                {
                  left: Math.round(mapSize / 2) - 32,
                  top: Math.round(mapSize / 2) + NODE_SIZE / 2 + m3.spacing.s2,
                },
              ]}
            >
              <RNText style={[m3TextStyle("labelSmall"), styles.meLabelText]}>
                {t("deepspace:people.me")}
              </RNText>
            </View>
          ) : null}

          {mapSize > 0
            ? nodes.map((node) => (
                <Pressable
                  key={`target-${node.id}`}
                  onPress={() =>
                    setSelectedId((currentId) => (currentId === node.id ? null : node.id))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={nodeAccessibilityLabel(node)}
                  accessibilityState={{ selected: node.id === selectedId }}
                  hitSlop={0}
                  style={[
                    styles.nodeTarget,
                    {
                      left: Math.min(
                        mapSize - PEOPLE_NODE_TARGET_SIZE,
                        Math.max(0, Math.round(node.x * mapSize) - PEOPLE_NODE_TARGET_SIZE / 2),
                      ),
                      top: Math.min(
                        mapSize - PEOPLE_NODE_TARGET_SIZE,
                        Math.max(0, Math.round(node.y * mapSize) - PEOPLE_NODE_TARGET_SIZE / 2),
                      ),
                    },
                  ]}
                />
              ))
            : null}
        </View>
      </PixelSurface>

      {pageCount > 1 ? (
        <View style={styles.pagination}>
          <PixelPressable
            onPress={() => selectPage(page - 1)}
            disabled={page === 0}
            accessibilityLabel={t("common:navPrev")}
            contentStyle={styles.pageActionContent}
          >
            <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
              {t("common:navPrev")}
            </RNText>
          </PixelPressable>
          <RNText style={[m3TextStyle("labelMedium"), styles.pageLabel]}>
            {`${page + 1}/${pageCount}`}
          </RNText>
          <PixelPressable
            onPress={() => selectPage(page + 1)}
            disabled={page + 1 >= pageCount}
            accessibilityLabel={t("common:navNext")}
            contentStyle={styles.pageActionContent}
          >
            <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
              {t("common:navNext")}
            </RNText>
          </PixelPressable>
        </View>
      ) : null}

      <View style={styles.legend}>
        {RELATION_SECTORS.map((relationKind) => (
          <View key={relationKind} style={styles.legendItem}>
            <View style={[styles.legendMark, { backgroundColor: KIND_COLOR[relationKind] }]} />
            <RNText style={[m3TextStyle("labelSmall"), styles.legendLabel]}>
              {t(`deepspace:people.kind.${relationKind}`)}
            </RNText>
          </View>
        ))}
      </View>
    </>
  );

  const formSurface = (
    <PixelSurface variant="frame" contentStyle={styles.formContent}>
      <Field
        label={t("deepspace:people.nameLabel")}
        value={name}
        onChangeText={setName}
        placeholder={t("deepspace:people.namePlaceholder")}
        editable={!saving}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => void handleAdd()}
      />

      <RNText style={[m3TextStyle("labelMedium"), styles.fieldLabel]}>
        {t("deepspace:people.relationLabel")}
      </RNText>
      <View style={styles.optionWrap}>
        {RELATION_SECTORS.map((relationKind) => (
          <PixelPressable
            key={relationKind}
            variant={kind === relationKind ? "inset" : "bevel"}
            disabled={saving}
            onPress={() => setKind(relationKind)}
            accessibilityLabel={t(`deepspace:people.kind.${relationKind}`)}
            accessibilityState={{ selected: kind === relationKind }}
            contentStyle={styles.optionContent}
          >
            <View style={[styles.optionMark, { backgroundColor: KIND_COLOR[relationKind] }]} />
            <RNText style={[m3TextStyle("labelMedium"), styles.optionLabel]}>
              {t(`deepspace:people.kind.${relationKind}`)}
            </RNText>
          </PixelPressable>
        ))}
      </View>

      <RNText style={[m3TextStyle("labelMedium"), styles.fieldLabel]}>
        {t("deepspace:people.closeness", { closeness })}
      </RNText>
      <View style={styles.closenessRow}>
        {[1, 2, 3, 4, 5].map((value) => (
          <PixelPressable
            key={value}
            variant={closeness === value ? "inset" : "bevel"}
            disabled={saving}
            onPress={() => setCloseness(value)}
            accessibilityLabel={t("deepspace:people.closeness", { closeness: value })}
            accessibilityState={{ selected: closeness === value }}
            rootStyle={styles.closenessRoot}
            style={styles.closenessPress}
            contentStyle={styles.closenessContent}
          >
            <RNText style={[m3TextStyle("labelLarge"), styles.optionLabel]}>{value}</RNText>
          </PixelPressable>
        ))}
      </View>

      {saveFailed ? (
        <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.saveError]}>
          {t("deepspace:people.saveFailed")}
        </RNText>
      ) : null}

      <PixelPressable
        fullWidth
        disabled={!name.trim() || saving}
        onPress={() => void handleAdd()}
        accessibilityLabel={saving ? t("deepspace:people.saving") : t("deepspace:people.save")}
        accessibilityState={{ busy: saving }}
        contentStyle={styles.primaryActionContent}
      >
        <RNText style={[m3TextStyle("labelLarge"), styles.primaryActionLabel]}>
          {saving ? t("deepspace:people.saving") : t("deepspace:people.save")}
        </RNText>
      </PixelPressable>

      <RNText style={[m3TextStyle("bodySmall"), styles.privacyNote]}>
        {t("deepspace:people.privacyNote")}
      </RNText>
    </PixelSurface>
  );

  return (
    <DeepSpaceScreen
      active="chat"
      header="none"
      variant="museumLike"
      title={t("deepspace:people.title")}
      onBack={handleBack}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            Platform.OS === "android" && {
              paddingBottom: Math.max(deepSpaceSpacing.xl, keyboardHeight + deepSpaceSpacing.lg),
            },
          ]}
        >
          <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.title]}>
            {t("deepspace:people.mapTitle")}
          </RNText>

          <PixelPressable
            fullWidth
            variant={adding ? "inset" : "bevel"}
            disabled={saving}
            onPress={openOrCloseForm}
            accessibilityLabel={addLabel}
            accessibilityState={{ expanded: adding, busy: saving }}
            contentStyle={styles.primaryActionContent}
          >
            <PixelGlyph name={adding ? "close" : "add"} color={m3.color.primary} size={24} />
            <RNText style={[m3TextStyle("labelLarge"), styles.primaryActionLabel]}>
              {addLabel}
            </RNText>
          </PixelPressable>

          {loadFailed && people !== null ? loadErrorSurface : null}

          {adding ? (
            formSurface
          ) : people === null ? (
            loadFailed ? (
              loadErrorSurface
            ) : (
              <View style={styles.loadingState}>
                <PremiumLoadingState message={t("deepspace:people.openingMap")} />
              </View>
            )
          ) : (
            mapSurface
          )}

          {!adding && selected ? (
            <PixelSurface variant="frame" contentStyle={styles.detailContent}>
              <RNText style={[m3TextStyle("titleMedium"), styles.detailName]} numberOfLines={2}>
                {selected.display_name}
              </RNText>
              <View style={styles.detailRow}>
                <View
                  style={[
                    styles.detailMark,
                    { backgroundColor: KIND_COLOR[selected.relation_kind] },
                  ]}
                />
                <RNText style={[m3TextStyle("bodyMedium"), styles.detailText]}>
                  {t(`deepspace:people.kind.${selected.relation_kind}`)}
                </RNText>
              </View>
              <RNText style={[m3TextStyle("bodyMedium"), styles.detailText]}>
                {t("deepspace:people.closeness", {
                  closeness: selected.closeness ?? "-",
                })}
              </RNText>
            </PixelSurface>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: {
    flexGrow: 1,
    gap: deepSpaceSpacing.md,
    padding: deepSpaceSpacing.lg,
    paddingBottom: deepSpaceSpacing.xl,
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  title: {
    color: m3.color.onSurface,
    paddingBottom: m3.spacing.s1,
  },
  primaryActionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s4,
  },
  primaryActionLabel: {
    color: m3.color.primary,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  actionLabel: { color: m3.color.primary, paddingBottom: m3.spacing.s1 },
  smallActionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
  },
  errorContent: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: m3.spacing.s4,
    padding: deepSpaceSpacing.md,
  },
  errorCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s3 },
  errorText: { color: m3.color.error, paddingBottom: m3.spacing.s1 },
  loadingState: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  mapSurface: { alignSelf: "stretch" },
  mapContent: { padding: 0 },
  mapStage: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    overflow: "hidden",
  },
  mapSvg: { ...StyleSheet.absoluteFill },
  nodeTarget: {
    position: "absolute",
    width: PEOPLE_NODE_TARGET_SIZE,
    height: PEOPLE_NODE_TARGET_SIZE,
  },
  meLabel: {
    position: "absolute",
    width: 64,
    alignItems: "center",
  },
  meLabelText: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
  },
  pageActionContent: {
    minHeight: m3.minTouch,
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s4,
  },
  pageLabel: {
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s3 },
  legendItem: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
  },
  legendMark: { width: m3.spacing.s3, height: m3.spacing.s3 },
  legendLabel: { color: m3.color.onSurfaceVariant, paddingBottom: m3.spacing.s1 },
  formContent: { gap: deepSpaceSpacing.sm, padding: deepSpaceSpacing.md },
  fieldLabel: {
    color: m3.color.onSurfaceVariant,
    marginTop: m3.spacing.s2,
    paddingBottom: m3.spacing.s1,
  },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s3 },
  optionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
  },
  optionMark: { width: m3.spacing.s3, height: m3.spacing.s3 },
  optionLabel: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  closenessRow: { flexDirection: "row", gap: m3.spacing.s2 },
  closenessRoot: { flex: 1, minWidth: 0 },
  closenessPress: { alignSelf: "stretch", width: "100%" },
  closenessContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  saveError: { color: m3.color.error, paddingBottom: m3.spacing.s1 },
  privacyNote: {
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  detailContent: { gap: m3.spacing.s3, padding: deepSpaceSpacing.md },
  detailName: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  detailRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
  },
  detailMark: { width: m3.spacing.s4, height: m3.spacing.s4 },
  detailText: { color: m3.color.onSurfaceVariant, paddingBottom: m3.spacing.s1 },
});
