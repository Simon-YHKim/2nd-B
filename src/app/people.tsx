// 관계 인물맵 (rev2 P4c): the relation domain lens. Center = 나; people orbit
// by closeness (closer = nearer), grouped into six relation sectors. Tap a dot
// for the per-person drilldown; the add form is the first WRITE surface for
// relation_people (0058) — the writer lib existed with no screen, so the 관계
// star finally receives real data (its brightness folds relation_people).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip, SegBtn } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { createPerson, listPeople, type Person, type RelationKind } from "@/lib/relation/people";
import { layoutPeopleMap, RELATION_SECTORS } from "@/lib/relation/people-map-layout";

const CANVAS = 1000;

const KIND_LABEL: Record<RelationKind, { en: string; ko: string }> = {
  family: { en: "Family", ko: "가족" },
  partner: { en: "Partner", ko: "파트너" },
  friend: { en: "Friend", ko: "친구" },
  colleague: { en: "Colleague", ko: "동료" },
  mentor: { en: "Mentor", ko: "멘토" },
  other: { en: "Other", ko: "그 밖에" },
};

const KIND_COLOR: Record<RelationKind, string> = {
  family: m3.accent.moodPositive,
  partner: m3.accent.moodNegative,
  friend: m3.accent.starCore,
  colleague: m3.accent.star,
  mentor: m3.accent.polaris,
  other: m3.accent.starDim,
};

export default function PeopleMapScreen() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const isKo = locale === "ko";

  const [people, setPeople] = useState<Person[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RelationKind>("friend");
  const [closeness, setCloseness] = useState<number>(3);

  const refresh = useCallback(() => {
    if (!userId) return;
    listPeople(userId)
      .then(setPeople)
      .catch((e) => {
        console.warn("[people] list failed", (e as Error).message);
        setPeople([]);
      });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const nodes = useMemo(() => layoutPeopleMap(people ?? []), [people]);
  const selected = useMemo(
    () => (people ?? []).find((p) => p.id === selectedId) ?? null,
    [people, selectedId],
  );

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
    if (!userId || !name.trim() || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await createPerson(userId, { display_name: name.trim(), relation_kind: kind, closeness });
      setName("");
      setAdding(false);
      refresh();
    } catch (e) {
      console.warn("[people] save failed", (e as Error).message);
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
            {isKo ? "관계 인물맵" : "People map"}
          </Text>
          <MdButton
            variant="tonal"
            label={adding ? (isKo ? "닫기" : "Close") : isKo ? "사람 담기" : "Add person"}
            onPress={() => setAdding((v) => !v)}
          />
        </View>

        {adding ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Field
              label={isKo ? "이름 또는 부르는 말" : "Name or how you call them"}
              value={name}
              onChangeText={setName}
              placeholder={isKo ? "예: 어머니, 준호" : "e.g. Mom, Alex"}
            />
            <Text variant="caption" color="textMuted">
              {isKo ? "관계" : "Relation"}
            </Text>
            <View style={styles.chipWrap}>
              {RELATION_SECTORS.map((k) => (
                <MdChip
                  key={k}
                  kind="filter"
                  label={KIND_LABEL[k][locale]}
                  selected={kind === k}
                  onPress={() => setKind(k)}
                />
              ))}
            </View>
            <Text variant="caption" color="textMuted">
              {isKo ? `가까움 ${closeness}/5` : `Closeness ${closeness}/5`}
            </Text>
            <SegBtn
              segments={[1, 2, 3, 4, 5].map((c) => ({ key: String(c), label: String(c) }))}
              selected={[String(closeness)]}
              onSelect={(key) => setCloseness(Number(key))}
            />
            {saveFailed ? (
              <Text variant="caption" color="textSubtle">
                {isKo ? "저장하지 못했어요. 다시 시도해 주세요." : "Could not save. Please try again."}
              </Text>
            ) : null}
            <MdButton
              variant="filled"
              disabled={!name.trim() || saving}
              label={saving ? (isKo ? "저장 중…" : "Saving…") : isKo ? "담기" : "Save"}
              onPress={handleAdd}
            />
            <Text variant="caption" color="textSubtle">
              {isKo
                ? "타인 정보는 내 기억을 위한 최소한만. 내 계정에만 저장돼요."
                : "Only the minimum about others, for your own memory. Stored in your account only."}
            </Text>
          </MdCard>
        ) : null}

        {people === null ? (
          <PremiumLoadingState message={isKo ? "지도를 펴는 중…" : "Opening the map…"} />
        ) : nodes.length === 0 ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {isKo
                ? "아직 담긴 사람이 없어요. 가까운 사람부터 하나씩 담아 보세요. 관계 별이 밝아져요."
                : "No one here yet. Add the people close to you, one by one; the relation star brightens."}
            </Text>
          </MdCard>
        ) : (
          <View style={styles.mapWrap}>
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${CANVAS} ${CANVAS}`}
              accessibilityLabel={isKo ? "관계 인물맵" : "People map"}
            >
              {[0.16, 0.31, 0.46].map((r) => (
                <Circle
                  key={r}
                  cx={CANVAS / 2}
                  cy={CANVAS / 2}
                  r={r * CANVAS}
                  fill="none"
                  stroke={withAlpha(m3.accent.starDim, 0.16)}
                  strokeWidth={1}
                />
              ))}
              {nodes.map((node) => (
                <Line
                  key={`l-${node.id}`}
                  x1={CANVAS / 2}
                  y1={CANVAS / 2}
                  x2={node.x * CANVAS}
                  y2={node.y * CANVAS}
                  stroke={withAlpha(KIND_COLOR[node.kind], 0.22)}
                  strokeWidth={1.2}
                />
              ))}
              <Circle cx={CANVAS / 2} cy={CANVAS / 2} r={26} fill={withAlpha(m3.accent.polaris, 0.9)} />
              <SvgText
                x={CANVAS / 2}
                y={CANVAS / 2 + 52}
                fill={withAlpha(m3.accent.skyTextHi, 0.8)}
                fontSize={26}
                textAnchor="middle"
              >
                {isKo ? "나" : "me"}
              </SvgText>
              {nodes.map((node) => {
                const isSel = node.id === selectedId;
                const r = 14 + node.closeness * 2.4;
                return (
                  <G key={node.id}>
                    {isSel ? (
                      <Circle
                        cx={node.x * CANVAS}
                        cy={node.y * CANVAS}
                        r={r + 9}
                        fill="none"
                        stroke={withAlpha(m3.accent.star, 0.75)}
                        strokeWidth={3}
                      />
                    ) : null}
                    <Circle
                      cx={node.x * CANVAS}
                      cy={node.y * CANVAS}
                      r={r}
                      fill={withAlpha(KIND_COLOR[node.kind], 0.92)}
                      onPress={() => setSelectedId((prev) => (prev === node.id ? null : node.id))}
                    />
                    <SvgText
                      x={node.x * CANVAS}
                      y={node.y * CANVAS - r - 8}
                      fill={withAlpha(m3.accent.skyTextHi, 0.85)}
                      fontSize={24}
                      textAnchor="middle"
                    >
                      {node.name.length > 6 ? `${node.name.slice(0, 5)}…` : node.name}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </View>
        )}

        {selected ? (
          <MdCard variant="filled" style={styles.cardPad}>
            <View style={styles.headRow}>
              <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
                {selected.display_name}
              </Text>
              <MdChip kind="assist" label={KIND_LABEL[selected.relation_kind][locale]} />
            </View>
            <Text variant="body" color="textMuted">
              {isKo
                ? `가까움 ${selected.closeness ?? "-"}/5${selected.contact_cadence ? ` · 연락 ${selected.contact_cadence}` : ""}${selected.last_interaction_on ? ` · 마지막 ${selected.last_interaction_on}` : ""}`
                : `Closeness ${selected.closeness ?? "-"}/5${selected.contact_cadence ? ` · contact ${selected.contact_cadence}` : ""}${selected.last_interaction_on ? ` · last ${selected.last_interaction_on}` : ""}`}
            </Text>
            {selected.note ? <Text variant="body">{selected.note}</Text> : null}
          </MdCard>
        ) : null}

        <View style={styles.legend}>
          {RELATION_SECTORS.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: KIND_COLOR[k] }]} />
              <Text variant="caption" color="textMuted">
                {KIND_LABEL[k][locale]}
              </Text>
            </View>
          ))}
        </View>
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
  mapWrap: {
    aspectRatio: 1,
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accentDim, 0.22),
    backgroundColor: withAlpha(deepSpace.bgMid, 0.35),
    overflow: "hidden",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
