import { ScreenModal } from "@/components/ui/ScreenModal";
import { PhoneView as View, PhoneScrollView as ScrollView, PhonePressable as Pressable, PhoneTouchableOpacity as TouchableOpacity } from "@/components/phone/PhoneUIKit";
// Polaris / Core Brain screen (core-brain pack v2). Internal route and data
// keys stay "Core Brain"; user-facing name is "북극성". Reuses the read-only
// saved persona projection and a real records fetch for the
// evidence drawer. Per the pack's data_contract we never fabricate
// unsupported summaries — sections fall back to a collecting/empty state.
//
// Section order (pack §2): Header · hero orb · 요즘 가장 밝은 연결 ·
// 밝아진 동네 · 자주 보이는 나의 모습 · 이걸 만든 별가루들 · 다음 한 걸음 ·
// 세컨비에게 이 중심으로 묻기.

// React stays a value import: jest compiles this route with the classic JSX runtime
// (jest.config.js ts-jest jsx: "react") and core-brain-minor-gate.test.ts renders it.
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { subscribeFontStyle } from "@/lib/settings/readable-font";
import { StyleSheet, Platform } from "react-native";
import { Rect, Svg } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Redirect, type Href } from "expo-router";

import { Text } from "@/components/ui/Text";
import { ServiceConsentLink } from "@/components/consent/ServiceConsentLink";
import { Button } from "@/components/ui/Button";
import { PremiumLoadingState } from "@/components/premium";
import { cosmic, semantic, spacing } from "@/lib/theme/tokens";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { stepPolyline } from "@/components/pixel/pixel-line";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { PolarisCardOverlay, PolarisCardSurface } from "@/components/deep-space/PolarisCardOverlay";
import { PolarisDeck, type PolarisDeckPage } from "@/components/deep-space/PolarisDeck";
import { PolarisCategorySlots } from "@/components/deep-space/PolarisCategorySlots";
import { MdButton, m3TextStyle } from "@/components/m3";
import { m3, m3BrightnessBand } from "@/lib/theme/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { STRENGTH_LABEL_EN, STRENGTH_LABEL_KO } from "@/lib/persona/strengths-survey";
import { OFFERABLE } from "@/lib/assess/registry";
import { SEVEN_STARS, type SevenStarId } from "@/lib/persona/seven-stars";
import { evidenceTypeLabel, type EvidenceShard } from "@/lib/persona/evidence";
import { useCoreEvidenceRead } from "@/lib/persona/use-core-evidence-read";
import { buildSelfPortrait } from "@/lib/persona/self-portrait";
import { claimQaPolarisAuto, proposeRoleCards, ratifyRoleCard, type RoleCard } from "@/lib/persona/role-cards";
import { requestGlobalCue } from "@/lib/audio/global-cues";
import { useCoreBrightnessRead, useCoreCompanionReads, useCoreRoleReads } from "@/lib/persona/use-core-role-reads";
import { useCompanionMoment } from "@/components/art/CompanionSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { useAppRouter } from "@/lib/nav/phone-embed";

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

// One functional screen: all data (evidence, persona, the deck pages, the
// evidence drawer) and every CTA live here. (LensView is the 7-axis per-trait
// view — wrong fit for the aggregate Polaris readout, so it is not used here.)
// The premium-shell chrome of the old `EXPO_PUBLIC_UI=legacy` track left with the
// lever on 2026-10-05 (Simon decision Q-261004-11); its tail is kept as a revive
// source in legacy/screens/core-brain.tsx (Q-261004-12).
//
// 2026-09-30 (Simon localhost QA): on deep-space the Polaris is a card over the
// constellation, not a page. The route is a transparent modal and the shell is
// PolarisCardOverlay (swipe up / down to close, left / right through the deck).
// States that are not a deck (loading, load error) sit in one Polaris card.
function CoreShell({ children, deck = false }: { children: ReactNode; deck?: boolean }) {
  return (
    <PolarisCardOverlay>{deck ? children : <PolarisCardSurface>{children}</PolarisCardSurface>}</PolarisCardOverlay>
  );
}

// 출처로 가른다. `validated` 만 "검증된 검사" 문구 아래 놓는다 -- 나머지는
// 가볍고 유용하지만 표준화된 척도가 아니고, 그 차이를 화면이 말해야 한다.
const VALIDATED_TOOLS = OFFERABLE.filter((a) => a.provenance === "validated");
const SELF_TOOLS = OFFERABLE.filter((a) => a.provenance !== "validated");

export default function CoreBrain() {
  return <CoreBrainScreen />;
}

function CoreBrainScreen() {
  // Phone-aware: inside the dashboard phone, the deck's links open in the phone.
  const router = useAppRouter();
  const { t, i18n } = useTranslation("core-brain");
  const { t: consentT } = useTranslation("consent");
  // 별 이름은 홈 별자리와 **같은 키**에서 읽는다 -- 두 화면이 갈라지면
  // 사용자는 같은 별을 다른 이름으로 두 번 배우게 된다.
  const { t: tHome } = useTranslation("home");
  const { userId, loading, hasProfile, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [reloadKey, setReloadKey] = useState(0);
  const [evidenceReloadKey, setEvidenceReloadKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rolePending, setRolePending] = useState(false);
  const [roleError, setRoleError] = useState(false);
  const [roleErrorCode, setRoleErrorCode] = useState("");
  const roleBusy = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const { fire: fireCompanion } = useCompanionMoment();

  const primaryRead = useCoreEvidenceRead(userId, !loading && hasProfile === true && isMinor !== null,
    locale, reloadKey, evidenceReloadKey, () => setReloadKey((key) => key + 1), () => fireCompanion("connectionFound"));
  const { persona = null, evidence = [] } = primaryRead.data ?? {};
  const primaryScope = primaryRead.scope;
  const primaryIsCurrent = primaryRead.isCurrent;
  const canAutoPropose = primaryRead.canAutoPropose;
  const brightnessRead = useCoreBrightnessRead(userId, primaryScope, primaryIsCurrent, primaryRead.invalidateAuto);
  const sevenLevels = brightnessRead.status === "ready" ? brightnessRead.data : null;
  const roleReads = useCoreRoleReads(userId, primaryScope, primaryIsCurrent, primaryRead.invalidateAuto);
  const companionReads = useCoreCompanionReads(userId, primaryScope, primaryIsCurrent, primaryRead.invalidateAuto);
  const portraitSignals = companionReads.portrait.data;
  const strengths = companionReads.strengths.data;
  const { beginMutation } = roleReads;
  const visibleRoleCards = roleReads.roles.data ?? [];
  const rolesReady = roleReads.roles.status === "ready";
  const roleReadScope = rolesReady ? primaryScope : null;
  const quota = roleReads.quota.status === "ready" ? roleReads.quota.data : null;
  useEffect(() => { setRolePending(false); }, [primaryScope]);
  useEffect(() => { setRoleError(false); setRoleErrorCode(""); }, [userId]);
  useEffect(() => { setDrawerOpen(false); }, [primaryScope]);

  // Refocus and retry are reads. Neither may reactivate the initial QA proposal.
  useFocusRefetch(() => {
    primaryRead.invalidateAuto();
    setEvidenceReloadKey((key) => key + 1);
  }, Boolean(userId && hasProfile === true));

  // Simon explicitly authorized one dev-only draft for the existing QA
  // account. Everyone else's mount path remains read-only. No auto approval.
  useEffect(() => {
    if (loading || !userId || isMinor === null || hasProfile !== true ||
        !canAutoPropose() || roleReadScope !== primaryScope || !rolesReady || roleBusy.current) return;
    let alive = true;
    const current = () => alive && canAutoPropose() && currentUser.current === userId;
    void (async () => {
      const claimed = await claimQaPolarisAuto(userId, visibleRoleCards.length > 0, evidence.length > 0, current);
      if (!claimed || !current() || roleBusy.current) return;
      const operation = beginMutation(true);
      if (!operation) return;
      primaryRead.invalidateAuto();
      roleBusy.current = true;
      setRolePending(true);
      setRoleError(false);
      setRoleErrorCode("");
      let succeeded = false;
      try {
        const next = await proposeRoleCards(userId, locale, isMinor);
        if (operation.isCurrent()) { operation.publish(next); succeeded = true; }
      } catch (error) {
        if (operation.isCurrent()) { setRoleError(true); setRoleErrorCode(error instanceof Error ? error.message : ""); }
      } finally {
        roleBusy.current = false;
        if (operation.isCurrent()) setRolePending(false);
        operation.finish(succeeded);
      }
    })();
    return () => { alive = false; };
  }, [loading, userId, isMinor, hasProfile, primaryScope, roleReadScope, canAutoPropose, rolesReady, visibleRoleCards.length, evidence.length, locale, beginMutation, primaryRead.invalidateAuto]);

  const generateRoles = async () => {
    if (!userId || isMinor === null || roleBusy.current || !quota?.available) return;
    primaryRead.invalidateAuto();
    const operation = beginMutation(true);
    if (!operation) return;
    roleBusy.current = true;
    setRolePending(true);
    setRoleError(false);
    setRoleErrorCode("");
    let succeeded = false;
    try {
      const next = await proposeRoleCards(userId, locale, isMinor);
      if (operation.isCurrent()) { operation.publish(next); succeeded = true; }
    } catch (error) {
      if (operation.isCurrent()) { setRoleError(true); setRoleErrorCode(error instanceof Error ? error.message : ""); }
    } finally {
      roleBusy.current = false;
      if (operation.isCurrent()) setRolePending(false);
      operation.finish(succeeded);
    }
  };

  const approveRole = async (card: RoleCard) => {
    if (!userId || roleBusy.current) return;
    primaryRead.invalidateAuto();
    const operation = beginMutation(false);
    if (!operation) return;
    roleBusy.current = true;
    setRolePending(true);
    setRoleError(false);
    setRoleErrorCode("");
    let succeeded = false;
    try {
      const next = await ratifyRoleCard(userId, card);
      if (operation.isCurrent()) {
        operation.publish(next); succeeded = true;
        // Approval keeps the existing global sound gate, including drawer actions.
        requestGlobalCue("polarisRatified");
      }
    } catch {
      if (operation.isCurrent()) setRoleError(true);
    } finally {
      roleBusy.current = false;
      if (operation.isCurrent()) setRolePending(false);
      operation.finish(succeeded);
    }
  };

  const roleReadStatus = roleReads.roles.status === "loading"
    ? <PremiumLoadingState message={t("loading")} />
    : !rolesReady ? <View style={dsDeck.pageBody}>
      <Text variant="caption" color="textMuted">{t("roleLoadError")}</Text>
      <Button label={t("tryAgain")} variant="secondary" testID="core-roles-retry" onPress={roleReads.roles.retry} />
    </View> : null;
  const categoryBody = rolesReady ? <PolarisCategorySlots cards={visibleRoleCards} /> : roleReadStatus;

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

  const hasCurrentLoadError = primaryRead.status === "error" || primaryRead.status === "timeout";
  if (
    hasProfile !== true ||
    isMinor === null ||
    primaryRead.status === "loading"
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
              onPress={primaryRead.retry}
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

  const brightnessStatus = <View testID="core-brightness-status" style={dsDeck.pageBody}>
    {brightnessRead.status === "loading" ? <PremiumLoadingState message={t("loading")} />
      : brightnessRead.status !== "ready" ? <>
        <Text variant="caption" color="textMuted">{t("loadError")}</Text>
        <Button label={t("tryAgain")} variant="secondary" testID="core-brightness-retry" onPress={brightnessRead.retry} />
      </> : null}
  </View>;

  // Empty state (§7) — never fabricate a summary with no pieces. Show a dimmed,
  // locked constellation as the lure: Polaris stays dominant while the seven
  // canonical self-knowledge stars wait at the L1 color band.
  if (evidence.length === 0) {
    const dimStarColor = m3.starLadder.rest[0];
    return (
      <CoreShell deck>
        <PolarisDeck isKo={locale === "ko"} pages={[
          { key: "empty", title: t("polaris"), body: (
        <View style={styles.center}>
          <View style={styles.lockedConstellation}>
            <IslandArt id="core" size={120} />
            {sevenLevels ? <View testID="core-empty-stars" style={styles.lockedStarRow}>
              {SEVEN_STARS.map((star) => (
                <View key={star.id} style={styles.starItem}>
                  <View style={[styles.starDot, { backgroundColor: dimStarColor }]} />
                  <Text variant="caption" color="textSubtle" style={styles.starName}>
                    {tHome(`ds.star.${star.key}`)}
                  </Text>
                </View>
              ))}
            </View> : brightnessStatus}
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
          ) },
          { key: "categories", title: t("categoryTitle"), body: categoryBody },
        ]} />
      </CoreShell>
    );
  }

  // Saved rows do not carry measured provenance; their existing copy stays local.
  const pieces = persona ? { title: t("savedResult.title"), body: t("savedResult.body") } : null;

  // 나의 모습 — the 5-field self-portrait (who / forWhom / goal / do / fuel).
  // Data contract: only measured fields are filled. Collecting rows point to an
  // honest next step; filled rows point to records filtered to their evidence.
  // The remaining three fields disclose that automatic summary is not wired yet.
  // Trait provenance gates generated role/direction copy, not these independent
  // measurement reads. They refresh on focus and can predate persona synthesis.
  const portrait = companionReads.portrait.status === "ready"
    ? buildSelfPortrait({ persona: portraitSignals }, locale, t) : null;
  const companionStatus = (slot: "portrait" | "strengths") => {
    const read = companionReads[slot];
    return read.status === "loading" ? <PremiumLoadingState message={t("loading")} />
      : read.status !== "ready" ? <View style={dsDeck.pageBody}>
        <Text variant="caption" color="textMuted">{t("loadError")}</Text>
        <Button label={t("tryAgain")} variant="secondary" testID={`core-${slot}-retry`} onPress={read.retry} />
      </View> : null;
  };

  // Evidence drawer (§5) — shared by the deep-space deck and the legacy screen.
  const renderEvidenceDrawer = () => (
    <ScreenModal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
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
    </ScreenModal>
  );

  // rev2 deep-space track: the Claude 10-me composition is a three-card
  // horizontally paged persona deck. Every visible number below comes from the
  // real persona, structured assessments, evidence count, or domain ladder.
  // The prototype's role/strength sample values are never copied.
  // 북극성 밝기는 이제 **별 여섯**의 평균이다(2026-08-24). 도메인 로더가
  // 그 숫자를 더 이상 들고 있지 않으므로 별 쪽에서 읽는다.
  const polarisBandIndex = sevenLevels ? m3BrightnessBand(sevenLevels.northStarBrightness) - 1 : null;
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
          {sevenLevels && polarisBandIndex !== null ? <>
          <View style={dsDeck.polarisGraphic}>
            <Svg
              width="100%"
              height={132}
              viewBox="0 0 190 132"
              {...(Platform.OS === "web" ? {} : { accessible: true })}
              accessibilityRole="image"
              accessibilityLabel={t("polarisGraphicA11y")}
              testID="polaris-synthesis-graphic"
            >
              {POLARIS_DIPPER_CELLS.map((cell, index) => (
                <Rect key={`dipper-${index}`} x={cell.x} y={cell.y} width={3} height={3} fill={m3.accent.starDim} />
              ))}
              {POLARIS_GUIDE_CELLS.map((cell, index) => (
                <Rect key={`guide-${index}`} x={cell.x} y={cell.y} width={3} height={3} fill={m3.accent.starDim} />
              ))}
              {SEVEN_STARS.map((star) => {
                const level = sevenLevels.starLevels[star.id];
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
          </> : brightnessStatus}
          {visibleRoleCards.map((card) => (
            <View key={card.id} style={{ gap: 6, marginTop: 12 }}>
              <Text variant="heading">{card.label}</Text>
              <Text variant="body">{card.summary}</Text>
              <Text variant="caption" color="textMuted">
                {`${t(card.status === "ratified" ? "roleStatusRatified" : "roleStatusProposed")} · ${t("roleEvidenceMeta", { level: card.claimStrength, n: card.evidenceRefs.length })}`}
              </Text>
              {card.status === "proposed" ? (
                <MdButton
                  variant="outlined"
                  label={t("roleApprove")}
                  disabled={rolePending}
                  onPress={() => void approveRole(card)}
                />
              ) : null}
            </View>
          ))}
          {rolesReady && visibleRoleCards.length === 0 ? (
            <Text variant="caption" color="textMuted">
              {t("roleEmpty")}
            </Text>
          ) : null}
          {roleReadStatus}
          {roleError ? (
            <View style={dsDeck.pageBody}>
            <Text variant="caption" color="textMuted">
              {roleErrorCode === "consent_required" || roleErrorCode === "consent_check_unavailable"
                ? consentT(`serviceControl.${roleErrorCode}`)
                : t(roleErrorCode === "polaris_limit_exceeded" ? "generationLimit" : roleErrorCode === "polaris_live_required" ? "generationLiveRequired" : roleErrorCode === "polaris_no_evidence" ? "generationNoEvidence" : "roleLoadError")}
            </Text>
            {roleErrorCode === "consent_required" || roleErrorCode === "consent_check_unavailable" ? <ServiceConsentLink /> : null}
            </View>
          ) : null}
          <MdButton
            variant="tonal"
            label={t(rolePending ? "generationRunning" : "roleSuggest")}
            disabled={rolePending || !quota?.available}
            onPress={() => void generateRoles()}
          />
          {roleReads.quota.status === "loading" ? <PremiumLoadingState message={t("loading")} />
            : quota ? <Text variant="caption" color="textMuted">
              {t(quota.available ? "generationAllowance" : "generationUnavailable", { n: quota.introRemaining })}
            </Text> : <View style={dsDeck.pageBody}>
              <Text variant="caption" color="textMuted">{t("loadError")}</Text>
              <Button label={t("tryAgain")} variant="secondary" testID="core-quota-retry" onPress={roleReads.quota.retry} />
            </View>}
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
      key: "categories",
      title: t("categoryTitle"),
      accent: cosmic.soulViolet,
      body: <View style={dsDeck.pageBody}>{categoryBody}</View>,
    },
    {
      key: "portrait",
      title: t("deck.portrait"),
      accent: cosmic.soulViolet,
      body: (
        <View style={dsDeck.pageBody}>
          <Text style={dsDeck.pageHeadline}>{t("sideOfMe")}</Text>
          {portrait ? <View style={styles.fieldList}>
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
          </View> : companionStatus("portrait")}
          {portrait ? <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>
            {t("aiApprox")}
          </Text> : null}
          {strengthSummary.length > 0 ? (
            <View style={dsDeck.progressiveSummary}>
              <Text style={dsDeck.pageDescription}>
                {`${t("strengthsCheck")}: ${strengthSummary.join(" · ")}`}
              </Text>
            </View>
          ) : null}
          {companionStatus("strengths")}
          <View style={dsDeck.secondaryActions}>
            <MdButton variant="outlined" label={t("brightness")} onPress={() => router.push("/brightness")} />
            <MdButton variant="outlined" label={t("ratLog")} onPress={() => router.push("/ratifications")} />
          </View>
        </View>
      ),
    },
    {
      key: "evidence",
      title: t("deck.evidence"),
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
            label={t("persona:export")}
            onPress={() => router.push("/share-card")}
          />
        </View>
      ),
    },
  ];
  return (
    <CoreShell deck>
      <View style={dsDeck.wrap}>
        <PolarisDeck pages={deckPages} isKo={locale === "ko"} />
      </View>
      {renderEvidenceDrawer()}
    </CoreShell>
  );
}

function evidenceLabel(ev: EvidenceShard, locale: "en" | "ko"): string {
  return [ev.dateLabel, evidenceTypeLabel(ev.type, locale)].filter(Boolean).join(" · ");
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  starItem: { width: "30%", alignItems: "center", gap: 4 },
  starDot: { width: 14, height: 14, borderRadius: m3.shape.none, backgroundColor: cosmic.soulViolet },
  starName: { textAlign: "center", fontSize: 11 },
  fieldList: { gap: spacing.xs },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  fieldLabel: { letterSpacing: 0 },
  fieldDot: { width: 8, height: 8, borderRadius: m3.shape.none },
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
    backgroundColor: m3.polarisCard.surfaceLow,
  },
  roleStatement: {
    ...m3TextStyle("bodyLarge"),
    color: m3.polarisCard.ink,
    lineHeight: 24,
    textAlign: "center",
  },
  roleAction: { alignSelf: "stretch" },
  pageBody: { gap: 12 },
  pageHeadline: {
    ...m3TextStyle("headlineSmall"),
    color: m3.polarisCard.ink,
    fontWeight: "700",
  },
  pageDescription: {
    ...m3TextStyle("bodyLarge"),
    color: m3.polarisCard.inkMuted,
  },
  progressiveSummary: {
    padding: 12,
    backgroundColor: m3.polarisCard.surfaceLow,
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
