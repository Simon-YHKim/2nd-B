// Polaris / Core Brain screen (core-brain pack v2). Internal route and data
// keys stay "Core Brain"; user-facing name is "북극성". Reuses the read-only
// persona snapshot
// + buildCenterCards (the §7-2 cards) and a real records fetch for the
// evidence drawer. Per the pack's data_contract we never fabricate
// unsupported summaries — sections fall back to a collecting/empty state.
//
// Section order (pack §2): Header · hero orb · 요즘 가장 밝은 연결 ·
// 밝아진 동네 · 자주 보이는 나의 모습 · 이걸 만든 별가루들 · 다음 한 걸음 ·
// 세컨비에게 이 중심으로 묻기.

import React, { useEffect, useState, type ReactNode } from "react";
import { subscribeFontStyle } from "@/lib/settings/readable-font";
import { View, StyleSheet, ScrollView, Modal, Pressable, TouchableOpacity } from "react-native";
import { Rect, Svg } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Redirect, router, type Href } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import {
  PremiumAppShell,
  PremiumCTA,
  PremiumLoadingState,
  SceneHero,
  StatTile,
} from "@/components/premium";
import { cosmic, semantic, spacing } from "@/lib/theme/tokens";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { stepPolyline } from "@/components/pixel/pixel-line";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PolarisDeck, type PolarisDeckPage } from "@/components/deep-space/PolarisDeck";
import { MdButton, m3TextStyle } from "@/components/m3";
import { m3, m3BrightnessBand } from "@/lib/theme/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  loadLatestStrengths,
  loadPersonaSnapshot,
  loadSelfPortraitSignals,
  type LoadedStrengths,
  type PersonaCard,
  type SelfPortraitSignals,
} from "@/lib/persona/build";
import { STRENGTH_LABEL_EN, STRENGTH_LABEL_KO } from "@/lib/persona/strengths-survey";
import type { DomainId } from "@/lib/persona/domain-stars";
import { loadDomainLevels, type DomainBrightness } from "@/lib/persona/load-domain-levels";
import { HOME_STAR_IDS } from "@/lib/persona/home-stars";
import { OFFERABLE } from "@/lib/assess/registry";
import { listInferredLinkDetails } from "@/lib/wiki/queries";
import { loadProfileStarLevel } from "@/lib/persona/load-profile-star";
import { loadSevenLevels, type SevenLevels } from "@/lib/persona/load-seven-levels";
import { SEVEN_STARS, type SevenStarId } from "@/lib/persona/seven-stars";
import type { LadderLevel } from "@/lib/persona/brightness";
import { brightnessVisual, brightnessBand, type BrightnessBand } from "@/lib/persona/brightness-visual";
import { buildCenterCards, type CenterCard } from "@/lib/persona/center";
import { mergeEvidence, evidenceTypeLabel, type EvidenceShard, type OriginShard, type RawRecordRow, type RawSourceRow } from "@/lib/persona/evidence";
import { buildSelfPortrait } from "@/lib/persona/self-portrait";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";

// D-25: Polaris brightness shows as a qualitative band, never a raw %.
const SOUL_CORE_BAND_KO: Record<BrightnessBand, string> = { dim: "흐릿", fair: "보통", bright: "밝음" };
const SOUL_CORE_BAND_EN: Record<BrightnessBand, string> = { dim: "dim", fair: "fair", bright: "bright" };

// Compact, integer-grid copy of the canonical home topology. The bowl closes,
// the handle reaches profile, and only the work -> now pointer continues to
// Polaris as a dotted guide. This is a map, not a claim that profile contributes
// to headline brightness (the six-way calculation remains in loadSevenLevels).
const POLARIS_INPUT_POINTS: Record<SevenStarId, readonly [number, number]> = {
  profile: [38, 120],
  infancy: [56, 92],
  school: [78, 86],
  twenties: [106, 80],
  later: [120, 96],
  work: [154, 82],
  now: [154, 56],
};
const POLARIS_OUTPUT_POINT = [100, 24] as const;
const POLARIS_BOWL_IDS: readonly SevenStarId[] = ["now", "work", "later", "twenties", "now"];
const POLARIS_HANDLE_IDS: readonly SevenStarId[] = ["twenties", "school", "infancy", "profile"];
const POLARIS_GUIDE_IDS: readonly SevenStarId[] = ["work", "now"];
const POLARIS_DIPPER_CELLS = [POLARIS_BOWL_IDS, POLARIS_HANDLE_IDS].flatMap((ids) =>
  stepPolyline(ids.map((id) => POLARIS_INPUT_POINTS[id]), 3),
);
const POLARIS_GUIDE_CELLS = stepPolyline(
  [...POLARIS_GUIDE_IDS.map((id) => POLARIS_INPUT_POINTS[id]), POLARIS_OUTPUT_POINT],
  3,
).filter((_, index) => index % 3 === 0);

async function loadCoreBrainEvidence(userId: string, locale: "en" | "ko"): Promise<OriginShard[]> {
  const supabase = getSupabaseClient();
  // Core must count ALL saved pieces the user sees in /records, not just
  // `records`: non-journal Capture/Import/Wiki land in `sources`. Reading
  // only records gives source-only users a false "center is still small"
  // empty state (data-truth gate). Mirrors /records' merged read.
  const [recRes, srcRes] = await Promise.all([
    supabase
      .from("records")
      .select("id, kind, topic, created_at, tags")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("sources")
      .select("id, kind, title, captured_at, tags")
      .eq("user_id", userId)
      .order("captured_at", { ascending: false })
      .limit(24),
  ]);
  // A transient RLS/timeout/token-refresh error returns data null without
  // throwing — surface it as an error state instead of a false empty one.
  if (recRes.error) {
    if (typeof console !== "undefined") console.warn("[core-brain] records query failed", recRes.error);
    throw recRes.error;
  }
  const recRows = (recRes.data ?? []) as RawRecordRow[];
  // Sources are best-effort: a sources failure degrades to records-only, never blanks Core.
  let srcRows: RawSourceRow[] = [];
  if (srcRes.error) {
    if (typeof console !== "undefined") console.warn("[core-brain] sources query failed; records only", srcRes.error);
  } else {
    srcRows = (srcRes.data ?? []) as RawSourceRow[];
  }
  return mergeEvidence(recRows, srcRows, locale);
}

// Canon (deep-space) and legacy now share ONE functional screen — the canon
// build no longer shows a placeholder lens. The only difference is the chrome:
// the deep-space dock (DeepSpaceScreen) vs the premium shell. All data
// (evidence, persona, the eight sections, the evidence drawer) and every CTA are
// identical and live in both. (LensView is the 7-axis per-trait view — wrong fit
// for the aggregate Polaris readout, so it is no longer used here.)
function CoreShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("core-brain");
  return isDeepSpaceUI() ? (
    <DeepSpaceScreen
      active="home"
      header="none"
      variant="windowed"
      title={t("polaris")}
      onBack={() => router.back()}
    >
      {children}
    </DeepSpaceScreen>
  ) : (
    <PremiumAppShell>{children}</PremiumAppShell>
  );
}

// 출처로 가른다. `validated` 만 "검증된 검사" 문구 아래 놓는다 -- 나머지는
// 가볍고 유용하지만 표준화된 척도가 아니고, 그 차이를 화면이 말해야 한다.
const VALIDATED_TOOLS = OFFERABLE.filter((a) => a.provenance === "validated");
const SELF_TOOLS = OFFERABLE.filter((a) => a.provenance !== "validated");

function hasUnrecordedPersonaProvenance(persona: PersonaCard): boolean {
  return Object.values(persona.traitConfidence ?? {}).some(
    (confidence) => confidence.source === "default",
  );
}

function buildCoreCenterCards(persona: PersonaCard, locale: "en" | "ko"): CenterCard[] {
  if (!hasUnrecordedPersonaProvenance(persona)) return buildCenterCards(persona, locale);

  return [
    {
      id: "pieces",
      title: locale === "ko" ? "기존 저장 결과" : "Previously saved result",
      body:
        locale === "ko"
          ? "기존 저장 결과예요. 출처가 기록되지 않아 지금의 방향으로 단정하지 않아요."
          : "Previously saved result. Its source was not recorded, so we do not present it as your current direction.",
      accent: cosmic.pixelLamp,
    },
  ];
}

export default function CoreBrain() {
  return <CoreBrainScreen />;
}

function CoreBrainScreen() {
  const { t, i18n } = useTranslation("core-brain");
  // 별 이름은 홈 별자리와 **같은 키**에서 읽는다 -- 두 화면이 갈라지면
  // 사용자는 같은 별을 다른 이름으로 두 번 배우게 된다.
  const { t: tHome } = useTranslation("home");
  const { userId, loading, hasProfile, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [evidence, setEvidence] = useState<OriginShard[]>([]);
  const [domainBrightness, setDomainBrightness] = useState<DomainBrightness | null>(null);
  const [sevenLevels, setSevenLevels] = useState<SevenLevels | null>(null);
  const [profileLevel, setProfileLevel] = useState<LadderLevel | null>(null);
  const [strengths, setStrengths] = useState<LoadedStrengths | null>(null);
  const [building, setBuilding] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorUserId, setLoadErrorUserId] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [evidenceReloadKey, setEvidenceReloadKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingLinkCount, setPendingLinkCount] = useState(0);
  const [portraitSignals, setPortraitSignals] = useState<SelfPortraitSignals | null>(null);
  const { moment: companionMoment, fire: fireCompanion } = useCompanionMoment();

  useEffect(() => {
    // The snapshot path is SELECT-only. Still wait for auth/profile hydration so
    // the effect cannot query under an unresolved or stale user identity.
    if (loading || !userId || hasProfile !== true || isMinor === null) return;
    let cancelled = false;
    setBuilding(true);
    setLoadError(false);
    setLoadErrorUserId(null);
    setPortraitSignals(null);
    (async () => {
      try {
        const [ev, nextDomainBrightness, nextStars, nextProfileLevel, nextStrengths] = await Promise.all([
          loadCoreBrainEvidence(userId, locale),
          loadDomainLevels(userId).catch(() => null),
          loadSevenLevels(userId).catch(() => null),
          loadProfileStarLevel(userId).catch(() => null),
          loadLatestStrengths(getSupabaseClient(), userId).catch(() => null),
        ]);
        const snapshot = ev.length > 0 ? await loadPersonaSnapshot(userId) : null;
        const p = snapshot && nextStars
          ? { ...snapshot, soulCoreBrightness: nextStars.northStarBrightness }
          : snapshot;
        if (!cancelled) {
          setEvidence(ev);
          setPersona(p);
          setDomainBrightness(nextDomainBrightness);
          setSevenLevels(nextStars);
          setProfileLevel(nextProfileLevel);
          setStrengths(nextStrengths);
          setResolvedUserId(userId);
          // 아치 lights up when the center surfaces a fresh connection (companion pack §3).
          if (p) fireCompanion("connectionFound");
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] load failed", (e as Error).message);
        if (!cancelled) {
          setPersona(null);
          setEvidence([]);
          setDomainBrightness(null);
          setSevenLevels(null);
          setProfileLevel(null);
          setStrengths(null);
          setPortraitSignals(null);
          setResolvedUserId(null);
          setLoadError(true);
          setLoadErrorUserId(userId);
        }
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, hasProfile, isMinor, locale, fireCompanion, reloadKey]);

  // /digest 조건부 문("다음 한 걸음")의 게이트 — 스냅샷 mount 로드는 SELECT-only
  // 단일 로드라는 계약(위 이펙트 주석·core-brain-minor-gate.test)이 있어 거기에
  // 합류시키지 않는다. 이 보조 조회는 실패·지연해도 화면 빌드를 막지 않는다.
  useEffect(() => {
    if (loading || !userId || hasProfile !== true || isMinor === null) return;
    let cancelled = false;
    listInferredLinkDetails(userId)
      .then((links) => {
        if (!cancelled) setPendingLinkCount(links.length);
      })
      .catch(() => {
        if (!cancelled) setPendingLinkCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, userId, hasProfile, isMinor, reloadKey]);
  // Re-focus refreshes only cheap DB evidence. The initial/retry path above is
  // also read-only; persona synthesis and persistence require an explicit action.
  useFocusRefetch(() => setEvidenceReloadKey((k) => k + 1), Boolean(userId && hasProfile === true));

  useEffect(() => {
    if (evidenceReloadKey === 0 || !userId || hasProfile !== true || resolvedUserId !== userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [ev, nextDomainBrightness, nextStars, nextStrengths] = await Promise.all([
          loadCoreBrainEvidence(userId, locale),
          loadDomainLevels(userId).catch(() => null),
          loadSevenLevels(userId).catch(() => null),
          loadLatestStrengths(getSupabaseClient(), userId).catch(() => null),
        ]);
        if (!cancelled) {
          setEvidence(ev);
          if (nextDomainBrightness) setDomainBrightness(nextDomainBrightness);
          if (nextStars) setSevenLevels(nextStars);
          setStrengths(nextStrengths);
          setLoadError(false);
          setLoadErrorUserId(null);
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] evidence refresh failed", (e as Error).message);
        if (!cancelled) {
          setLoadError(true);
          setLoadErrorUserId(userId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hasProfile, locale, evidenceReloadKey, resolvedUserId]);

  // Direct portrait measurements are optional, SELECT-only companions to the
  // synthesized persona. Load them independently so an assessment read failure
  // cannot turn the whole Core Brain into an error screen; focus/retry refreshes
  // them without calling the LLM or writing a persona row.
  useEffect(() => {
    if (loading || !userId || hasProfile !== true || isMinor === null) return;
    let cancelled = false;
    loadSelfPortraitSignals(userId)
      .then((signals) => {
        if (!cancelled) setPortraitSignals(signals);
      })
      .catch(() => {
        // Optional field data stays at its prior/collecting state; the main
        // evidence loader owns the screen-level error surface.
      });
    return () => {
      cancelled = true;
    };
  }, [loading, userId, hasProfile, isMinor, reloadKey, evidenceReloadKey]);

  if (loading) {
    return (
      <CoreShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </CoreShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const hasCurrentLoadError = loadError && loadErrorUserId === userId;
  if (
    hasProfile !== true ||
    isMinor === null ||
    building ||
    (resolvedUserId !== userId && !hasCurrentLoadError)
  ) {
    return (
      <CoreShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </CoreShell>
    );
  }

  // Load error — a records query error must NOT masquerade as the empty state,
  // or a user who has pieces sees "your center is still small" on a transient
  // RLS/timeout/token-refresh failure. Offer a retry instead.
  if (hasCurrentLoadError) {
    return (
      <CoreShell>
        <View style={styles.center}>
          <IslandArt id="core" size={140} />
          <Text variant="heading" style={{ marginTop: spacing.lg, textAlign: "center" }}>
            {t("loadError")}
          </Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {t("loadErrorBody")}
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label={t("tryAgain")}
              variant="primary"
              onPress={() => setReloadKey((k) => k + 1)}
            />
            <Button
              label={t("startSecondB")}
              variant="secondary"
              onPress={() => router.push("/secondb")}
            />
          </View>
        </View>
      </CoreShell>
    );
  }

  // Empty state (§7) — never fabricate a summary with no pieces. Show a dimmed,
  // locked constellation as the lure: Polaris stays dominant while the seven
  // canonical self-knowledge stars wait at the L1 color band.
  if (evidence.length === 0) {
    const dimStarColor = m3.starLadder.rest[0];
    return (
      <CoreShell>
        <View style={styles.center}>
          <View style={styles.lockedConstellation}>
            <IslandArt id="core" size={120} />
            <View style={styles.lockedStarRow}>
              {SEVEN_STARS.map((star) => (
                <View key={star.id} style={styles.starItem}>
                  <View style={[styles.starDot, { backgroundColor: dimStarColor }]} />
                  <Text variant="caption" color="textSubtle" style={styles.starName}>
                    {tHome(`ds.star.${star.key}`)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Text variant="heading" style={{ marginTop: spacing.lg, textAlign: "center" }}>
            {t("sevenStars")}
          </Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {tHome("ds.home.star.now.line")}
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label={tHome("ds.star.start")}
              variant="primary"
              onPress={() => router.push("/me/now")}
            />
            <Button
              label={t("leavePiece")}
              variant="secondary"
              onPress={() => router.push("/capture")}
            />
          </View>
        </View>
      </CoreShell>
    );
  }

  const hasUnrecordedProvenance = persona ? hasUnrecordedPersonaProvenance(persona) : false;
  const cards = persona ? buildCoreCenterCards(persona, locale) : [];
  const direction = cards.find((c) => c.id === "direction");
  const neighborhood = cards.find((c) => c.id === "neighborhood");
  const pieces = cards.find((c) => c.id === "pieces");

  // 나의 모습 — the 5-field self-portrait (who / forWhom / goal / do / fuel).
  // Data contract: only measured fields are filled. Collecting rows point to an
  // honest next step; filled rows point to records filtered to their evidence.
  // The remaining three fields disclose that automatic summary is not wired yet.
  // Trait provenance gates generated role/direction copy, not these independent
  // measurement reads. They refresh on focus and can predate persona synthesis.
  const portrait = buildSelfPortrait({ persona: portraitSignals }, locale);

  const filledFields = portrait.filter((f) => f.status === "filled").length;
  const domainLevels: Record<DomainId, LadderLevel> | undefined = domainBrightness?.domainLevels;
  const starBrightness = sevenLevels?.northStarBrightness ?? null;

  // Evidence drawer (§5) — shared by the deep-space deck and the legacy screen.
  const renderEvidenceDrawer = () => (
    <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
      <Pressable
        style={styles.backdrop}
        onPress={() => setDrawerOpen(false)}
        accessibilityRole="button"
        accessibilityLabel={t("closeEvidence")}
      >
        {/* 모달 스크림은 **디더**다. 바탕을 모르는 자리라(모달은 어느 화면 위에도
            뜬다) `flattenAlpha` 를 쓸 수 없다 — 규칙 4 가 정확히 이 경우를 위해
            "평탄화 말고 디더"라고 못박고 있다. 타일은 4×4 중 12픽셀이 캐논 바닥색,
            4픽셀 투명이라 반투명이 한 픽셀도 없다. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PixelScrim />
        </View>
        <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <View style={styles.drawerHandle} />
          <Text variant="heading">{t("piecesBehind")}</Text>
          <Text variant="subtle" color="textMuted" style={{ marginTop: 4 }}>
            {t("piecesBehindSub")}
          </Text>
          <ScrollView style={{ marginTop: spacing.md }} contentContainerStyle={{ gap: spacing.sm }}>
            {evidence.map((ev) => (
              <TouchableOpacity
                key={ev.id}
                style={styles.evRow}
                activeOpacity={0.7}
                onPress={() => {
                  setDrawerOpen(false);
                  // Carry the origin. An evidence shard can be a `records` row or a
                  // `sources` row (mergeEvidence keeps the raw uuid and tags the shard with
                  // `origin`), and the detail screen has to know which table to look in.
                  // Without it, every source-origin shard -- every link, clip and import --
                  // opened a detail screen that searched `records`, found nothing, and said
                  // "찾을 수 없어요".
                  router.push({ pathname: "/record/[id]", params: { id: ev.id, origin: ev.origin } });
                }}
                accessibilityRole="button"
                accessibilityLabel={t("openRecord", { title: ev.title })}
                accessibilityHint={evidenceLabel(ev, locale)}
              >
                <View style={styles.evDot} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" numberOfLines={1}>{ev.title}</Text>
                  <Text variant="subtle" color="textSubtle">
                    {evidenceLabel(ev, locale)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Button
            label={t("seeAllRecords")}
            variant="secondary"
            onPress={() => {
              setDrawerOpen(false);
              router.push("/records");
            }}
          />
          <Button label={t("close")} variant="secondary" onPress={() => setDrawerOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  );

  // rev2 deep-space track: the Claude 10-me composition is a three-card
  // horizontally paged persona deck. Every visible number below comes from the
  // real persona, structured assessments, evidence count, or domain ladder.
  // The prototype's role/strength sample values are never copied.
  if (isDeepSpaceUI()) {
    // 북극성 밝기는 이제 **별 여섯**의 평균이다(2026-08-24). 도메인 로더가
    // 그 숫자를 더 이상 들고 있지 않으므로 별 쪽에서 읽는다.
    const polarisBandIndex = m3BrightnessBand(starBrightness ?? 0.2) - 1;
    const strengthSummary = (strengths?.scores ?? []).slice(0, 4).map((score) =>
      locale === "ko" ? STRENGTH_LABEL_KO[score.strength] : STRENGTH_LABEL_EN[score.strength],
    );
    const askPolaris = () =>
      router.push({ pathname: "/secondb", params: { fromNode: t("polaris") } });
    const deckPages: PolarisDeckPage[] = [
      {
        key: "role",
        title: t("polaris"),
        accent: cosmic.soulViolet,
        body: (
          <View style={dsDeck.roleBody}>
            <View style={dsDeck.polarisGraphic}>
              <Svg
                width="100%"
                height={132}
                viewBox="0 0 190 132"
                accessible
                accessibilityRole="image"
                accessibilityLabel={
                  locale === "ko"
                    ? "일곱 별자리와 북극성. 북극성 밝기는 프로필을 제외한 여섯 별에서 옵니다."
                    : "Seven-star constellation and Polaris. Polaris brightness comes from the six stars excluding profile."
                }
                testID="polaris-synthesis-graphic"
              >
                {POLARIS_DIPPER_CELLS.map((cell, index) => (
                  <Rect key={`dipper-${index}`} x={cell.x} y={cell.y} width={3} height={3} fill={m3.accent.starDim} />
                ))}
                {POLARIS_GUIDE_CELLS.map((cell, index) => (
                  <Rect key={`guide-${index}`} x={cell.x} y={cell.y} width={3} height={3} fill={m3.accent.starDim} />
                ))}
                {SEVEN_STARS.map((star) => {
                  const level = sevenLevels?.starLevels?.[star.id] ?? 1;
                  const point = POLARIS_INPUT_POINTS[star.id];
                  return (
                    <PixelStarSvg
                      key={star.id}
                      cx={point[0]}
                      cy={point[1]}
                      r={2 + level}
                      fill={m3.starLadder.rest[level - 1]}
                    />
                  );
                })}
                <PixelStarSvg cx={POLARIS_OUTPUT_POINT[0]} cy={POLARIS_OUTPUT_POINT[1]} r={22} fill={m3.accent.polarisEdge} />
                <PixelStarSvg cx={POLARIS_OUTPUT_POINT[0]} cy={POLARIS_OUTPUT_POINT[1]} r={14} fill={m3.starLadder.polarisMid[polarisBandIndex]} />
                <PixelStarSvg cx={POLARIS_OUTPUT_POINT[0]} cy={POLARIS_OUTPUT_POINT[1]} r={6} fill={m3.starLadder.polarisCore[polarisBandIndex]} />
              </Svg>
            </View>
            <Text style={dsDeck.roleStatement}>{t("currentBrightness")}</Text>
            <MdButton
              variant="filled"
              label={t("editNorthStar")}
              onPress={() => router.push("/northstar")}
              style={dsDeck.roleAction}
            />
          </View>
        ),
      },
      {
        key: "portrait",
        title: locale === "ko" ? "나의 모습" : "SELF PORTRAIT",
        accent: cosmic.soulViolet,
        body: (
          <View style={dsDeck.pageBody}>
            <Text style={dsDeck.pageHeadline}>{t("sideOfMe")}</Text>
            <View style={styles.fieldList}>
              {portrait.map((field) => (
                <TouchableOpacity
                  key={field.id}
                  style={styles.fieldRow}
                  activeOpacity={0.7}
                  onPress={() => router.push(field.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={field.value ? `${field.label}: ${field.value}` : field.label}
                  accessibilityHint={field.actionHint}
                >
                  <View
                    style={[styles.fieldDot, { backgroundColor: field.status === "filled" ? cosmic.signalMint : semantic.border }]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{field.label}</Text>
                    {field.status === "filled" ? (
                      <Text variant="body">{field.value}</Text>
                    ) : (
                      <Text variant="subtle" color="textSubtle">{field.hint}</Text>
                    )}
                  </View>
                  <Text
                    variant="caption"
                    color="brand"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    →
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>
              {t("aiApprox")}
            </Text>
            {strengthSummary.length > 0 ? (
              <View style={dsDeck.progressiveSummary}>
                <Text style={dsDeck.pageDescription}>
                  {`${t("strengthsCheck")}: ${strengthSummary.join(" · ")}`}
                </Text>
              </View>
            ) : null}
            <View style={dsDeck.secondaryActions}>
              <MdButton variant="outlined" label={t("brightness")} onPress={() => router.push("/brightness")} />
              <MdButton variant="outlined" label={t("ratLog")} onPress={() => router.push("/ratifications")} />
            </View>
          </View>
        ),
      },
      {
        key: "evidence",
        title: locale === "ko" ? "근거와 검증" : "EVIDENCE",
        accent: cosmic.signalMint,
        body: (
          <View style={dsDeck.pageBody}>
            <Text style={dsDeck.pageHeadline}>{t("piecesBehind")}</Text>
            {pieces ? <Text style={dsDeck.pageDescription}>{pieces.body}</Text> : null}
            <MdButton
              variant="tonal"
              label={t("seePieces", { n: evidence.length })}
              onPress={() => setDrawerOpen(true)}
            />
            <Text style={[dsDeck.pageHeadline, dsDeck.validationHead]}>{t("waysToMeasure")}</Text>
            <Text variant="caption" color="textMuted">
              {t("validatedChecks")}
            </Text>
            {/* 목록의 정본은 `src/lib/assess/registry.ts` 다. 여기 하드코딩돼
                있을 때 두 가지가 틀어져 있었다 -- (1) "검증된 검사" 라는 문구
                아래에 자체 제작 문항(강점·가치관)이 섞여 있었고, (2) 아홉 개
                중 넷만 진입점이 있어서 IPIP-NEO-120 · 생활만족 · 인생점검 ·
                대화는 이 화면에서 닿을 수 없었다. */}
            {VALIDATED_TOOLS.map((tool) => (
              <MdButton
                key={tool.id}
                variant="outlined"
                label={t(tool.labelKey)}
                onPress={() => router.push(tool.route as Href)}
              />
            ))}
            {/* 자체 제작 문항은 **줄을 갈라서** 보여준다. 위 문구가 "검증된
                검사"라고 말하는 이상, 검증되지 않은 것을 그 아래 섞으면 화면이
                거짓말을 한다. */}
            <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
              {t("selfChecks")}
            </Text>
            {SELF_TOOLS.map((tool) => (
              <MdButton
                key={tool.id}
                variant="outlined"
                label={t(tool.labelKey)}
                onPress={() => router.push(tool.route as Href)}
              />
            ))}
            <MdButton
              variant="text"
              label={t("askAboutCenter")}
              onPress={askPolaris}
            />
            <MdButton
              variant="text"
              label={locale === "ko" ? "내보내기" : "Export"}
              onPress={() => router.push("/share-card")}
            />
          </View>
        ),
      },
    ];
    return (
      <CoreShell>
        <View style={dsDeck.wrap}>
          <PolarisDeck pages={deckPages} isKo={locale === "ko"} />
        </View>
        {renderEvidenceDrawer()}
      </CoreShell>
    );
  }

  return (
    <CoreShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("soulCoreEyebrow")}
          title={t("piecesGather")}
          subtitle={t("connectingLately")}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={CORE_VILLAGE_UI.speech[locale]}
          primaryAction={{
            label: t("askSecondB"),
            onPress: () => router.push({ pathname: "/secondb", params: { fromNode: t("myCenter") } }),
          }}
        />
        <View style={styles.statRow}>
          <StatTile value={evidence.length} label={t("piecesWord")} accent={cosmic.pixelLamp} />
          <StatTile value={`${filledFields}/5`} label={t("selfPortrait")} accent={cosmic.soulViolet} />
          <StatTile value={persona?.values.length ?? 0} label={t("areasWord")} accent={cosmic.signalMint} />
          <StatTile
            value={
              locale === "ko"
                ? SOUL_CORE_BAND_KO[brightnessBand(persona?.soulCoreBrightness ?? 0.2)]
                : SOUL_CORE_BAND_EN[brightnessBand(persona?.soulCoreBrightness ?? 0.2)]
            }
            label={t("brightnessWord")}
            accent={cosmic.soulViolet}
          />
        </View>

        {/* 3) 요즘 가장 밝은 연결 */}
        {direction ? (
          <Section title={t("brightestConn")} accent={direction.accent}>
            <Text variant="body">{direction.body}</Text>
          </Section>
        ) : null}

        {/* 4) 밝아진 동네 / 영역 */}
        {neighborhood ? (
          <Section title={t("litNeighborhood")} accent={neighborhood.accent}>
            <Text variant="body">{neighborhood.body}</Text>
          </Section>
        ) : null}

        {/* 5) 자주 보이는 나의 모습 — 5-field self-portrait (data contract) */}
        <Section title={t("sideOfMe")} accent={cosmic.soulViolet}>
          <View style={styles.fieldList}>
            {portrait.map((field) => (
              <TouchableOpacity
                key={field.id}
                style={styles.fieldRow}
                activeOpacity={0.7}
                onPress={() => router.push(field.route as never)}
                accessibilityRole="button"
                accessibilityLabel={field.value ? `${field.label}: ${field.value}` : field.label}
                accessibilityHint={field.actionHint}
              >
                <View
                  style={[styles.fieldDot, { backgroundColor: field.status === "filled" ? cosmic.signalMint : semantic.border }]}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{field.label}</Text>
                  {field.status === "filled" ? (
                    <Text variant="body">{field.value}</Text>
                  ) : (
                    <Text variant="subtle" color="textSubtle">{field.hint}</Text>
                  )}
                </View>
                <Text
                  variant="caption"
                  color="brand"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  →
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Over-trust / EU AI Act Art.50 + GDPR Art.12 (research 2026-06-28): the
              inferred persona must be disclosed as a generative approximation, not
              authoritative self-knowledge. The legacy persona screen says this; the
              canon soul-core did not, so it is added here on the inferred-self card. */}
          <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>
            {t("aiApprox")}
          </Text>
          <Button
            label={t("lookAround")}
            variant="secondary"
            onPress={() => router.push("/persona")}
          />
        </Section>

        {/* 5b) 나를 아는 일곱 가지 — 홈이 그리는 그 일곱 (6 도메인 + 프로필).
            Simon 결정 2026-08-21: 폐기되는 심리 구인 대신 도메인을 보여준다.
            잠긴 상태(위 lockedStarRow)가 이미 도메인을 그리고 있었으므로, 이제
            잠금 전후가 **같은 일곱**을 말한다 -- 전에는 서로 달랐다.
            "곧" 배지는 사라졌다. 그건 엔진이 없는 구인 둘을 가리키던 것인데,
            도메인은 일곱 다 실재한다. 없는 걸 광고하지 않게 된다. */}
        {domainLevels ? (
          <Section title={t("sevenWays")} accent={cosmic.soulViolet}>
            <View style={styles.starRow}>
              {HOME_STAR_IDS.map((id) => {
                // 2026-08-24: 일곱이 생활 도메인에서 **나를 알아가는 자리**로 바뀌었다.
                // 이름은 홈 별자리와 같은 키(`ds.star.*`)에서 읽어 두 화면이 갈라지지
                // 않게 한다. 밝기는 아직 도메인 등급을 쓰지 않는다 -- 시기별 밝기는
                // 다음 단계(커버리지 연결)에서 붙는다.
                const level = id === "profile" ? profileLevel : null;
                const v = brightnessVisual(level ?? 1);
                const name = tHome(`ds.star.${id}`);
                return (
                  <View key={id} style={styles.starItem}>
                    <View style={[styles.starDot, { opacity: v.opacity }]} />
                    <Text variant="caption" color="textMuted" style={styles.starName}>
                      {name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Section>
        ) : null}

        {/* 6) 이걸 만든 별가루들 — evidence */}
        <Section title={t("piecesBehind")} accent={cosmic.pixelLamp}>
          {pieces ? <Text variant="body" style={{ marginBottom: spacing.sm }}>{pieces.body}</Text> : null}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setDrawerOpen(true)}
            style={styles.evidenceBtn}
            accessibilityRole="button"
            accessibilityLabel={
              t("seeEvidencePieces", { n: evidence.length })
            }
          >
            <Text variant="body" color="brand">
              {t("seePieces", { n: evidence.length })}
            </Text>
          </TouchableOpacity>
        </Section>

        {/* 7) 다음 한 걸음 */}
        <Section title={t("nextStep")} accent={cosmic.signalMint}>
          <Text variant="body" color="textMuted" style={{ marginBottom: spacing.sm }}>
            {t("narrowStep")}
          </Text>
          <Button
            label={t("openNewAngle")}
            variant="secondary"
            onPress={() => router.push({ pathname: "/secondb", params: { mode: "divergent" } })}
          />
          <Button
            label={t("reviewProposal")}
            variant="primary"
            onPress={() => router.push("/review")}
          />
          {/* 위 /review 버튼은 self-model 비준 진입(#807)이라 목적지를 바꾸지 않는다.
              아래는 별개의 문: 추론된 위키 링크 비준(/digest)은 진입이 알림함 조건부
              카드 하나뿐이었다(2026-09-01 감사 THIN·Q2-2 승인). 알림함 카드와 같은
              게이트(대기 링크 1건 이상)만 열린다 — 빈 화면으로 유인하지 않는다. */}
          {pendingLinkCount > 0 ? (
            <Button
              label={t("openDigest", { n: pendingLinkCount })}
              variant="secondary"
              onPress={() => router.push("/digest")}
            />
          ) : null}
        </Section>

        {/* 8) 세컨비에게 이 중심으로 묻기 */}
        <PremiumCTA
          label={t("askAboutCenter")}
          variant="secondary"
          onPress={() => router.push({ pathname: "/secondb", params: { fromNode: t("myCenter") } })}
        />
      </ScrollView>

      {renderEvidenceDrawer()}
      {/* 아치 appears briefly when a fresh connection surfaces (companion pack §3) */}
      {companionMoment ? (
        <CompanionMoment moment={companionMoment} style={styles.companionFlash} />
      ) : null}
    </CoreShell>
  );
}

function evidenceLabel(ev: EvidenceShard, locale: "en" | "ko"): string {
  return [ev.dateLabel, evidenceTypeLabel(ev.type, locale)].filter(Boolean).join(" · ");
}

function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <View style={[styles.section, { borderStartColor: accent }]}>
      <Text variant="caption" color="textMuted" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: 110 },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  hero: { alignItems: "center" },
  statRow: { flexDirection: "row", justifyContent: "space-around", gap: spacing.sm },
  starRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  starItem: { width: "30%", alignItems: "center", gap: 4 },
  starDot: { width: 14, height: 14, borderRadius: m3.shape.none, backgroundColor: cosmic.soulViolet },
  starName: { textAlign: "center", fontSize: 11 },
  starSoon: { textAlign: "center", fontSize: 9, letterSpacing: 1 },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: 0,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldList: { gap: spacing.xs },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  fieldLabel: { letterSpacing: 0 },
  fieldDot: { width: 8, height: 8, borderRadius: m3.shape.none },
  evidenceBtn: { paddingVertical: spacing.xs, minHeight: 44, justifyContent: "center" },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  drawer: {
    backgroundColor: semantic.surface,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderColor: semantic.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "70%",
  },
  drawerHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: m3.shape.none, backgroundColor: semantic.border, marginBottom: spacing.sm },
  sectionTitle: { letterSpacing: 0, marginBottom: spacing.xs },
  evRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  evDot: { width: 6, height: 6, borderRadius: m3.shape.none, backgroundColor: semantic.brand },
  // Empty-state locked constellation: Tier-1 core + a dim ring of seven stars.
  lockedConstellation: { alignItems: "center", gap: spacing.md },
  lockedStarRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center", maxWidth: 320 },
});

// rev2 P3a — deep-space 북극성 deck layout (the deck itself is PolarisDeck).
// 이 시트는 본문 역할(`m3TextStyle("body…")`)을 들고 있다. `StyleSheet.create`
// 는 모듈이 로드될 때 **한 번만** 평가되므로, 그대로 두면 저시력 옵션(읽는 글)
// 을 켜도 이 화면만 예전 얼굴로 남는다 -- 네이티브는 값 하이드레이션이 비동기라
// 영영 안 바뀐다. 그래서 시트를 **다시 만들 수 있게** 하고 설정이 바뀔 때
// 갈아끼운다. 화면이 다시 그려지는 것은 공유 셸(`DeepSpaceScreen`)이
// `useFontStyle()` 을 구독하기 때문이다.
const makeDsDeck = () => StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4 },
  roleBody: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingVertical: 12 },
  polarisGraphic: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 8,
    backgroundColor: m3.color.surfaceContainerLow,
  },
  roleStatement: {
    ...m3TextStyle("bodyLarge"),
    color: m3.color.onSurface,
    lineHeight: 24,
    textAlign: "center",
  },
  roleAction: { alignSelf: "stretch" },
  pageBody: { gap: 12 },
  pageHeadline: {
    ...m3TextStyle("headlineSmall"),
    color: m3.color.onSurface,
    fontWeight: "700",
  },
  pageDescription: {
    ...m3TextStyle("bodyLarge"),
    color: m3.color.onSurfaceVariant,
  },
  progressiveSummary: {
    padding: 12,
    backgroundColor: m3.color.surfaceContainerLow,
  },
  validationHead: { marginTop: 16 },
  secondaryActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
});

let dsDeck = makeDsDeck();
subscribeFontStyle(() => {
  dsDeck = makeDsDeck();
});
