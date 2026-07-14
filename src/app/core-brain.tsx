// 소울 코어 / Core Brain screen (core-brain pack v2). Internal concept
// stays "Core Brain"; user-facing name is "소울 코어". Reuses buildPersona
// + buildCenterCards (the §7-2 cards) and a real records fetch for the
// evidence drawer. Per the pack's data_contract we never fabricate
// unsupported summaries — sections fall back to a collecting/empty state.
//
// Section order (pack §2): Header · hero orb · 요즘 가장 밝은 연결 ·
// 밝아진 동네 · 자주 보이는 나의 모습 · 이걸 만든 별가루들 · 다음 한 걸음 ·
// 세컨비에게 이 중심으로 묻기.

import { useEffect, useState, type ReactNode } from "react";
import { View, StyleSheet, ScrollView, Modal, Pressable, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import {
  PremiumAppShell,
  PremiumCTA,
  PremiumLoadingState,
  SceneHero,
  StatTile,
} from "@/components/premium";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PolarisDeck, type PolarisDeckPage } from "@/components/deep-space/PolarisDeck";
import { TraitRadar } from "@/components/persona/TraitRadar";
import { MdButton } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { buildPersona, isMeasuredSource, type PersonaCard } from "@/lib/persona/build";
import { SELF_UNDERSTANDING_STARS } from "@/lib/persona/stars";
import { brightnessVisual, brightnessBand, type BrightnessBand } from "@/lib/persona/brightness-visual";
import { buildCenterCards } from "@/lib/persona/center";
import { mergeEvidence, evidenceTypeLabel, type EvidenceShard, type OriginShard, type RawRecordRow, type RawSourceRow } from "@/lib/persona/evidence";
import { buildSelfPortrait } from "@/lib/persona/self-portrait";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { IslandArt } from "@/components/art/IslandArt";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";

// D-25: Soul Core brightness shows as a qualitative band, never a raw %.
const SOUL_CORE_BAND_KO: Record<BrightnessBand, string> = { dim: "흐릿", fair: "보통", bright: "밝음" };
const SOUL_CORE_BAND_EN: Record<BrightnessBand, string> = { dim: "dim", fair: "fair", bright: "bright" };

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
// for the aggregate Soul Core, so it is no longer used here.)
function CoreShell({ children }: { children: ReactNode }) {
  return isDeepSpaceUI() ? (
    <DeepSpaceScreen active="lens">{children}</DeepSpaceScreen>
  ) : (
    <PremiumAppShell>{children}</PremiumAppShell>
  );
}

export default function CoreBrain() {
  return <CoreBrainScreen />;
}

function CoreBrainScreen() {
  const { t, i18n } = useTranslation("core-brain");
  const { userId, loading, hasProfile, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [evidence, setEvidence] = useState<OriginShard[]>([]);
  const [building, setBuilding] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [evidenceReloadKey, setEvidenceReloadKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { moment: companionMoment, fire: fireCompanion } = useCompanionMoment();

  useEffect(() => {
    // buildPersona() calls Gemini — don't fire it for a no-profile OAuth session
    // (gated here because the effect runs before the render redirect). C10 + consent.
    if (!userId || hasProfile === false) return;
    let cancelled = false;
    setBuilding(true);
    setLoadError(false);
    (async () => {
      try {
        const ev = await loadCoreBrainEvidence(userId, locale);
        const p = ev.length > 0 ? await buildPersona(userId, locale, isMinor === true) : null;
        if (!cancelled) {
          setEvidence(ev);
          setPersona(p);
          // 아치 lights up when the center surfaces a fresh connection (companion pack §3).
          if (p) fireCompanion("connectionFound");
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] load failed", (e as Error).message);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hasProfile, isMinor, locale, fireCompanion, reloadKey]);
  // Re-focus refreshes only cheap DB evidence. The initial/manual path above is
  // the only path that may run buildPersona(), because buildPersona calls Gemini.
  useFocusRefetch(() => setEvidenceReloadKey((k) => k + 1), Boolean(userId && hasProfile !== false));

  useEffect(() => {
    if (evidenceReloadKey === 0 || !userId || hasProfile === false) return;
    let cancelled = false;
    (async () => {
      try {
        const ev = await loadCoreBrainEvidence(userId, locale);
        if (!cancelled) {
          setEvidence(ev);
          setLoadError(false);
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] evidence refresh failed", (e as Error).message);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hasProfile, locale, evidenceReloadKey]);

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

  if (building) {
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
  if (loadError) {
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
  // locked constellation as the lure: the Tier-1 core stays dominant while the
  // seven stars wait at the L1 dim floor (brightnessVisual(1).opacity = 0.2).
  // The first relationship check lights one straight away.
  if (evidence.length === 0) {
    const dimStar = brightnessVisual(1).opacity;
    return (
      <CoreShell>
        <View style={styles.center}>
          <View style={styles.lockedConstellation}>
            <IslandArt id="core" size={120} />
            <View style={styles.lockedStarRow}>
              {SELF_UNDERSTANDING_STARS.map((star) => (
                <View key={star.id} style={styles.starItem}>
                  <View style={[styles.starDot, { opacity: dimStar }]} />
                  <Text variant="caption" color="textSubtle" style={styles.starName}>
                    {locale === "ko" ? star.nameKo : star.nameEn}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Text variant="heading" style={{ marginTop: spacing.lg, textAlign: "center" }}>
            {t("sevenStars")}
          </Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            {t("threeMin")}
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label={t("startRelCheck")}
              variant="primary"
              onPress={() => router.push("/attachment")}
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

  const cards = persona ? buildCenterCards(persona, locale) : [];
  const direction = cards.find((c) => c.id === "direction");
  const neighborhood = cards.find((c) => c.id === "neighborhood");
  const pieces = cards.find((c) => c.id === "pieces");

  // 나의 모습 — the 5-field self-portrait (who / forWhom / goal / do / fuel).
  // Data contract: only measured fields are filled; the rest stay collecting
  // and point the user at the one place that would fill them. Never fabricated.
  const portrait = buildSelfPortrait({ persona }, locale);

  const filledFields = portrait.filter((f) => f.status === "filled").length;
  const starLevels = persona?.starLevels;

  // Evidence drawer (§5) — shared by the deep-space deck and the legacy screen.
  const renderEvidenceDrawer = () => (
    <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
      <Pressable
        style={styles.backdrop}
        onPress={() => setDrawerOpen(false)}
        accessibilityRole="button"
        accessibilityLabel={t("closeEvidence")}
      >
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

  // rev2 P3a (deep-space track): the same data as the legacy sections below,
  // reorganized as the 북극성 persona deck — one card per screenful (swipe),
  // Big Five radar + validation entry included. User-facing name here is
  // 북극성 (the legacy core name is dropped on the canon track, PRD v3).
  // The legacy premium-shell screen below is untouched.
  if (isDeepSpaceUI()) {
    const band = brightnessBand(persona?.soulCoreBrightness ?? 0.2);
    const bandLabel = locale === "ko" ? SOUL_CORE_BAND_KO[band] : SOUL_CORE_BAND_EN[band];
    const askPolaris = () =>
      router.push({ pathname: "/secondb", params: { fromNode: t("polaris") } });
    const deckPages: PolarisDeckPage[] = [
      {
        key: "polaris",
        title: t("polarisAggregate"),
        accent: cosmic.soulViolet,
        body: (
          <View style={dsDeck.heroBody}>
            <Text variant="display" style={dsDeck.heroBand}>{bandLabel}</Text>
            <Text variant="caption" color="textMuted" style={dsDeck.heroCaption}>
              {t("currentBrightness")}
            </Text>
            <View style={dsDeck.heroStats}>
              <Text variant="body" color="textMuted">
                {t("piecesCount", { n: evidence.length })}
              </Text>
              <Text variant="body" color="textMuted">
                {t("selfPortraitCount", { n: filledFields })}
              </Text>
              <Text variant="body" color="textMuted">
                {t("areasCount", { n: persona?.values.length ?? 0 })}
              </Text>
            </View>
            <Text variant="subtle" color="textSubtle" style={dsDeck.heroHint}>
              {t("swipeCards")}
            </Text>
            <View style={dsDeck.heroLinks}>
              <MdButton
                variant="text"
                label={t("brightness")}
                onPress={() => router.push("/brightness")}
              />
              <MdButton
                variant="text"
                label={t("ratLog")}
                onPress={() => router.push("/ratifications")}
              />
              <MdButton
                variant="text"
                label={t("shareCard")}
                onPress={() => router.push("/share-card")}
              />
            </View>
          </View>
        ),
      },
      ...(direction
        ? [{
            key: "direction",
            title: t("brightestConn"),
            accent: direction.accent,
            body: <Text variant="body">{direction.body}</Text>,
          }]
        : []),
      ...(neighborhood
        ? [{
            key: "neighborhood",
            title: t("litNeighborhood"),
            accent: neighborhood.accent,
            body: <Text variant="body">{neighborhood.body}</Text>,
          }]
        : []),
      {
        key: "portrait",
        title: t("sideOfMe"),
        accent: cosmic.soulViolet,
        body: (
          <View>
            <View style={styles.fieldList}>
              {portrait.map((field) => (
                <TouchableOpacity
                  key={field.id}
                  style={styles.fieldRow}
                  activeOpacity={0.7}
                  onPress={() => router.push(field.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={field.label}
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
                  {field.status === "collecting" ? (
                    <Text variant="caption" color="brand">{t("fill")}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
            <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>
              {t("aiApprox")}
            </Text>
          </View>
        ),
      },
      ...(persona
        ? [{
            key: "radar",
            title: t("traitTerrain"),
            accent: cosmic.soulViolet,
            body: (
              <View style={dsDeck.radarBody}>
                <TraitRadar traits={persona.traits} traitsSource={persona.traitsSource} locale={locale} />
                <MdButton
                  variant="tonal"
                  label={
                    isMeasuredSource(persona.traitsSource)
                      ? t("lookCloser")
                      : t("measureProperly")
                  }
                  onPress={() => router.push(isMeasuredSource(persona.traitsSource) ? "/persona" : "/big-five")}
                />
              </View>
            ),
          }]
        : []),
      ...(starLevels
        ? [{
            key: "seven",
            title: t("sevenWays"),
            accent: cosmic.soulViolet,
            body: (
              <View style={styles.starRow}>
                {SELF_UNDERSTANDING_STARS.map((star) => {
                  const v = brightnessVisual(starLevels[star.id]);
                  return (
                    <View key={star.id} style={styles.starItem}>
                      <View style={[styles.starDot, { opacity: v.opacity }]} />
                      <Text variant="caption" color="textMuted" style={styles.starName}>
                        {locale === "ko" ? star.nameKo : star.nameEn}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ),
          }]
        : []),
      {
        key: "pieces",
        title: t("piecesBehind"),
        accent: cosmic.pixelLamp,
        body: (
          <View>
            {pieces ? <Text variant="body" style={{ marginBottom: spacing.sm }}>{pieces.body}</Text> : null}
            <MdButton
              variant="text"
              label={t("seePieces", { n: evidence.length })}
              onPress={() => setDrawerOpen(true)}
            />
          </View>
        ),
      },
      {
        key: "validate",
        title: t("waysToMeasure"),
        accent: cosmic.signalMint,
        body: (
          <View style={dsDeck.validateList}>
            <Text variant="caption" color="textMuted" style={{ marginBottom: 4 }}>
              {t("validatedChecks")}
            </Text>
            {([
              { key: "bigfive", label: t("bigFiveCheck"), route: "/big-five" },
              { key: "ipip", label: t("facetMap"), route: "/ipip-neo" },
              { key: "attachment", label: t("relCheck"), route: "/attachment" },
              { key: "motivation", label: t("motivationCheck"), route: "/motivation" },
              { key: "strengths", label: t("strengthsCheck"), route: "/strengths" },
              { key: "values", label: t("valuesCheck"), route: "/values" },
              { key: "northstar", label: t("editNorthStar"), route: "/northstar" },
              // MBTI retired (src/app/mbti.tsx is a redirect to /persona) — a
              // 스크리너 button that lands on a different screen erodes trust.
              { key: "audit", label: t("valuesAudit"), route: "/audit" },
            ] as const).map((tool) => (
              <MdButton
                key={tool.key}
                variant="outlined"
                label={tool.label}
                onPress={() => router.push(tool.route)}
              />
            ))}
          </View>
        ),
      },
      {
        key: "next",
        title: t("nextStep"),
        accent: cosmic.signalMint,
        body: (
          <View style={dsDeck.validateList}>
            <Text variant="body" color="textMuted">
              {t("narrowStep")}
            </Text>
            <MdButton
              variant="outlined"
              label={t("newAngleTwi")}
              onPress={() => router.push({ pathname: "/secondb", params: { mode: "divergent" } })}
            />
            <MdButton
              variant="filled"
              label={t("reviewProposal")}
              onPress={() => router.push("/review")}
            />
            <MdButton
              variant="text"
              label={t("askAboutCenter")}
              onPress={askPolaris}
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
                accessibilityLabel={field.label}
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
                {field.status === "collecting" ? (
                  <Text variant="caption" color="brand">{t("fill")}</Text>
                ) : null}
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

        {/* 5b) 나를 아는 일곱 가지 — 7 self-understanding stars (constellation) */}
        {starLevels ? (
          <Section title={t("sevenWays")} accent={cosmic.soulViolet}>
            <View style={styles.starRow}>
              {SELF_UNDERSTANDING_STARS.map((star) => {
                const v = brightnessVisual(starLevels[star.id]);
                return (
                  <View key={star.id} style={styles.starItem}>
                    <View style={[styles.starDot, { opacity: v.opacity }]} />
                    <Text variant="caption" color="textMuted" style={styles.starName}>
                      {locale === "ko" ? star.nameKo : star.nameEn}
                    </Text>
                    {star.status === "absent" ? (
                      <Text variant="caption" color="textSubtle" style={styles.starSoon}>
                        {t("soon")}
                      </Text>
                    ) : null}
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
  starDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: cosmic.soulViolet },
  starName: { textAlign: "center", fontSize: 11 },
  starSoon: { textAlign: "center", fontSize: 9, letterSpacing: 1 },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldList: { gap: spacing.xs },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  fieldLabel: { letterSpacing: 0 },
  fieldDot: { width: 8, height: 8, borderRadius: 4 },
  evidenceBtn: { paddingVertical: spacing.xs, minHeight: 44, justifyContent: "center" },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  backdrop: { flex: 1, backgroundColor: semantic.backdrop, justifyContent: "flex-end" },
  drawer: {
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderColor: semantic.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "70%",
  },
  drawerHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: semantic.border, marginBottom: spacing.sm },
  sectionTitle: { letterSpacing: 0, marginBottom: spacing.xs },
  evRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  evDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
  // Empty-state locked constellation: Tier-1 core + a dim ring of seven stars.
  lockedConstellation: { alignItems: "center", gap: spacing.md },
  lockedStarRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center", maxWidth: 320 },
});

// rev2 P3a — deep-space 북극성 deck layout (the deck itself is PolarisDeck).
const dsDeck = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 12, paddingTop: 10 },
  heroBody: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.md },
  heroBand: { textAlign: "center" },
  heroCaption: { textAlign: "center" },
  heroStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  heroHint: { marginTop: spacing.lg, textAlign: "center" },
  heroLinks: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm },
  radarBody: { alignItems: "center", gap: spacing.md },
  validateList: { gap: spacing.sm },
});
