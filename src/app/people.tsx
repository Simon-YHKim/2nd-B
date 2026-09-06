// 관계 인물맵 (rev2 P4c): the relation domain lens. Center = 나; people orbit
// by closeness (closer = nearer), grouped into six relation sectors. Tap a dot
// for the per-person drilldown; the add form is the first WRITE surface for
// relation_people (0058) — the writer lib existed with no screen, so the 관계
// star finally receives real data (its brightness folds relation_people).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import * as Crypto from "expo-crypto";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip, SegBtn } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, flattenAlpha, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { ringCells, stepLine } from "@/components/pixel/pixel-line";
import { PixelNodeSvg, PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { createLatestWins } from "@/lib/async/latest-wins";
import { isTimeoutError } from "@/lib/async/with-timeout";

/**
 * 관계 지도 색 — 원래 `withAlpha(…)` 였다. 미리 합성해 둔다(PIXEL-CLAY 규칙 4).
 * 바닥은 이 지도가 앉은 카드 배경이다.
 */
const PEOPLE_GROUND = m3.color.surfaceContainerLow;
const PEOPLE_RING_FILL = flattenAlpha(m3.accent.starDim, 0.16, PEOPLE_GROUND);
const PEOPLE_ME_FILL = flattenAlpha(m3.accent.polaris, 0.9, PEOPLE_GROUND);
const PEOPLE_SEL_FILL = flattenAlpha(m3.accent.star, 0.75, PEOPLE_GROUND);
const peopleLinkFill = (c: string) => flattenAlpha(c, 0.22, PEOPLE_GROUND);

// 지도 상자의 바탕과 테두리. 상자는 카드 위에 앉는다.
const PEOPLE_MAP_BG = flattenAlpha(deepSpace.bgMid, 0.35, PEOPLE_GROUND);
const PEOPLE_MAP_BORDER = flattenAlpha(deepSpace.accentDim, 0.22, PEOPLE_GROUND);
// 지도 **안**의 글자는 카드가 아니라 위 상자 위에 앉는다. 한 겹 더 들어간 바탕이다.
const PEOPLE_MAP_TEXT = flattenAlpha(m3.accent.skyTextHi, 0.8, PEOPLE_MAP_BG);
const PEOPLE_MAP_TEXT_HI = flattenAlpha(m3.accent.skyTextHi, 0.85, PEOPLE_MAP_BG);
const peopleNodeFill = (c: string) => flattenAlpha(c, 0.92, PEOPLE_GROUND);
import {
  beginPersonSaveAttempt,
  completePersonSaveAttempt,
  createPerson,
  invalidatePersonSaveAttemptUi,
  isCurrentPersonSaveAttempt,
  listPeople,
  releasePersonSaveAttempt,
  type Person,
  type PersonSaveIdentity,
  type RelationKind,
} from "@/lib/relation/people";
import { layoutPeopleMap, RELATION_SECTORS } from "@/lib/relation/people-map-layout";

const CANVAS = 1000;

const KIND_COLOR: Record<RelationKind, string> = {
  family: m3.accent.moodPositive,
  partner: m3.accent.moodNegative,
  friend: m3.accent.starCore,
  colleague: m3.accent.star,
  mentor: m3.accent.polaris,
  other: m3.accent.starDim,
};

export default function PeopleMapScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading } = useAuth();

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:people.title")} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={t("deepspace:people.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // AuthContext can publish A -> B without a signed-out frame (for example,
  // another browser tab signs into a different account). Keying the complete
  // owner-bound state tree prevents A's map, draft, and late callbacks from
  // surviving under B's session.
  return <PeopleMapBody key={userId} userId={userId} />;
}

function PeopleMapBody({ userId }: { userId: string }) {
  const { t } = useTranslation("deepspace");

  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RelationKind>("friend");
  const [closeness, setCloseness] = useState<number>(3);
  const loadGuardRef = useRef(createLatestWins());
  const attemptGenRef = useRef(0);
  const saveIdRef = useRef<PersonSaveIdentity | null>(null);
  const inFlightRef = useRef<PersonSaveIdentity | null>(null);

  const refresh = useCallback(async () => {
    const token = loadGuardRef.current.begin();
    try {
      const next = await listPeople(userId);
      if (loadGuardRef.current.isStale(token)) return;
      setPeople(next);
      setLoadFailed(false);
    } catch (e) {
      if (loadGuardRef.current.isStale(token)) return;
      console.warn("[people] list failed", (e as Error).message);
      // Keep the last successful map. A network failure is not an empty account.
      setLoadFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    return () => {
      // Invalidate work owned by the previous user or an unmounted screen.
      loadGuardRef.current.begin();
      invalidatePersonSaveAttemptUi(attemptGenRef);
    };
  }, [refresh]);

  const nodes = useMemo(() => layoutPeopleMap(people ?? []), [people]);
  const selected = useMemo(
    () => (people ?? []).find((p) => p.id === selectedId) ?? null,
    [people, selectedId],
  );

  async function handleAdd() {
    if (!name.trim()) return;
    const attempt = beginPersonSaveAttempt(
      attemptGenRef,
      saveIdRef,
      inFlightRef,
      () => Crypto.randomUUID(),
    );
    if (attempt === null) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const created = await createPerson(userId, {
        display_name: name.trim(),
        relation_kind: kind,
        closeness,
      }, attempt.id, attempt.rev);
      const isCurrentUi = isCurrentPersonSaveAttempt(attemptGenRef, attempt);
      if (!completePersonSaveAttempt(saveIdRef, inFlightRef, attempt)) return;
      setSaving(false);
      setName("");
      setSaveFailed(false);
      if (isCurrentUi) {
        // The write is already confirmed. Show it immediately so a follow-up
        // list timeout cannot make a successful save look lost and invite a
        // duplicate entry. The background refresh then reconciles server order.
        setPeople((previous) =>
          previous === null
            ? [created]
            : [...previous.filter((person) => person.id !== created.id), created],
        );
        setAdding(false);
      }
      // A hidden form deliberately skips its stale local merge, but the
      // confirmed row still needs to appear and its draft must stay consumed.
      void refresh();
    } catch (e) {
      const isCurrentUi = isCurrentPersonSaveAttempt(attemptGenRef, attempt);
      if (!releasePersonSaveAttempt(inFlightRef, attempt)) return;
      setSaving(false);
      console.warn("[people] save failed", (e as Error).message);
      // A timed-out write may still have reached Postgres after the client
      // stopped waiting. Reconcile once before the user retries so a late row
      // can surface instead of encouraging an accidental duplicate.
      if (isTimeoutError(e)) void refresh();
      // Closing hides the old presentation generation. Preserve its draft and
      // id so reopening can retry the same row at rev+1 without stale UI copy.
      if (isCurrentUi) setSaveFailed(true);
    }
  }

  function closeAddForm() {
    invalidatePersonSaveAttemptUi(attemptGenRef);
    setSaveFailed(false);
    setAdding(false);
  }

  function toggleAddForm() {
    if (adding) {
      closeAddForm();
    } else if (!saving) {
      setAdding(true);
    }
  }

  return (
    <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:people.title")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headRow}>
          <Text variant="heading" style={{ flex: 1 }}>
            {t("deepspace:people.mapTitle")}
          </Text>
          <MdButton
            variant="tonal"
            disabled={!adding && saving}
            label={adding ? t("deepspace:people.close") : t("deepspace:people.addPerson")}
            onPress={toggleAddForm}
          />
        </View>

        {adding ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Field
              label={t("deepspace:people.nameLabel")}
              value={name}
              onChangeText={setName}
              placeholder={t("deepspace:people.namePlaceholder")}
            />
            <Text variant="caption" color="textMuted">
              {t("deepspace:people.relationLabel")}
            </Text>
            <View style={styles.chipWrap}>
              {RELATION_SECTORS.map((k) => (
                <MdChip
                  key={k}
                  kind="filter"
                  label={t(`deepspace:people.kind.${k}`)}
                  selected={kind === k}
                  onPress={() => setKind(k)}
                />
              ))}
            </View>
            <Text variant="caption" color="textMuted">
              {t("deepspace:people.closeness", { closeness })}
            </Text>
            <SegBtn
              segments={[1, 2, 3, 4, 5].map((c) => ({ key: String(c), label: String(c) }))}
              selected={[String(closeness)]}
              onSelect={(key) => setCloseness(Number(key))}
            />
            {saveFailed ? (
              <Text variant="caption" color="textSubtle">
                {t("deepspace:people.saveFailed")}
              </Text>
            ) : null}
            <MdButton
              variant="filled"
              disabled={!name.trim() || saving}
              label={saving ? t("deepspace:people.saving") : t("deepspace:people.save")}
              onPress={handleAdd}
            />
            <Text variant="caption" color="textSubtle">
              {t("deepspace:people.privacyNote")}
            </Text>
          </MdCard>
        ) : null}

        {loadFailed ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {t("common:errors.network")}
            </Text>
            <MdButton variant="tonal" label={t("common:actions.retry")} onPress={refresh} />
          </MdCard>
        ) : null}

        {people === null ? (
          loadFailed ? null : (
            <PremiumLoadingState message={t("deepspace:people.openingMap")} />
          )
        ) : nodes.length === 0 ? (
          <MdCard variant="outlined" style={styles.cardPad}>
            <Text variant="body" color="textMuted">
              {t("deepspace:people.empty")}
            </Text>
          </MdCard>
        ) : (
          <View style={styles.mapWrap}>
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${CANVAS} ${CANVAS}`}
              accessibilityLabel={t("deepspace:people.mapTitle")}
            >
              {/* 거리 고리 — 원이었다. 셀 격자 위에서는 사각 링이 정직하다(규칙 1). */}
              {[0.16, 0.31, 0.46].map((r) =>
                ringCells(CANVAS / 2, CANVAS / 2, r * CANVAS, 4).map((p, i) => (
                  <Rect key={`r${r}-${i}`} x={p.x} y={p.y} width={4} height={4} fill={PEOPLE_RING_FILL} />
                )),
              )}
              {nodes.map((node) =>
                stepLine(CANVAS / 2, CANVAS / 2, node.x * CANVAS, node.y * CANVAS, 4).map((p, i) => (
                  <Rect key={`l-${node.id}-${i}`} x={p.x} y={p.y} width={4} height={4} fill={peopleLinkFill(KIND_COLOR[node.kind])} />
                )),
              )}
              <PixelStarSvg cx={CANVAS / 2} cy={CANVAS / 2} r={26} fill={PEOPLE_ME_FILL} />
              <SvgText
                x={CANVAS / 2}
                y={CANVAS / 2 + 52}
                fill={PEOPLE_MAP_TEXT}
                fontSize={26}
                textAnchor="middle"
              >
                {t("deepspace:people.me")}
              </SvgText>
              {nodes.map((node) => {
                const isSel = node.id === selectedId;
                const r = 14 + node.closeness * 2.4;
                return (
                  <G key={node.id}>
                    {isSel
                      ? ringCells(node.x * CANVAS, node.y * CANVAS, r + 9, 3).map((p, i) => (
                          <Rect key={`sel${i}`} x={p.x} y={p.y} width={3} height={3} fill={PEOPLE_SEL_FILL} />
                        ))
                      : null}
                    <PixelNodeSvg
                      cx={node.x * CANVAS}
                      cy={node.y * CANVAS}
                      r={r}
                      fill={peopleNodeFill(KIND_COLOR[node.kind])}
                      onPress={() => setSelectedId((prev) => (prev === node.id ? null : node.id))}
                    />
                    <SvgText
                      x={node.x * CANVAS}
                      y={node.y * CANVAS - r - 8}
                      fill={PEOPLE_MAP_TEXT_HI}
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
              <MdChip kind="assist" label={t(`deepspace:people.kind.${selected.relation_kind}`)} />
            </View>
            <Text variant="body" color="textMuted">
              {`${t("deepspace:people.closeness", { closeness: selected.closeness ?? "-" })}${
                selected.contact_cadence ? t("deepspace:people.contactSuffix", { cadence: selected.contact_cadence }) : ""
              }${selected.last_interaction_on ? t("deepspace:people.lastSuffix", { date: selected.last_interaction_on }) : ""}`}
            </Text>
            {selected.note ? <Text variant="body">{selected.note}</Text> : null}
          </MdCard>
        ) : null}

        <View style={styles.legend}>
          {RELATION_SECTORS.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: KIND_COLOR[k] }]} />
              <Text variant="caption" color="textMuted">
                {t(`deepspace:people.kind.${k}`)}
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
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: PEOPLE_MAP_BORDER,
    backgroundColor: PEOPLE_MAP_BG,
    overflow: "hidden",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: m3.shape.none },
});
