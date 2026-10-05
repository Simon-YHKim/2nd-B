// 공유 카드 (rev2 P5c): the "자기이해 한 컷" share surface. The ShareCard
// component + 1080x1080 capture lib shipped earlier with NO entry point — this
// route surfaces them: A/B variant preview, live litStars from the user's real
// domain levels, and the OS share sheet via shareInsightCard (web falls back to
// a text share; capture uses the pre-mounted off-screen host, per the lib note).
// Privacy: the card carries ONE sentence + star count + piece count. The handle
// stays off the card (share-sheet text only) — sb-more signature verbatim.
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdChip } from "@/components/m3";
import { ShareCard } from "@/components/deepspace/ShareCard";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAppRouter, usePhoneEmbed } from "@/lib/nav/phone-embed";
import { spacing } from "@/lib/theme/tokens";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import { fetchCurrentNorthstar } from "@/lib/persona/northstar";
import { deriveCardProps, shareInsightCard } from "@/lib/share/insight-card";
import { countUserPieces } from "@/lib/share/piece-count";

// A load result and the account it was loaded for. This route can stay mounted
// while the account changes (A signs out, B signs in): a bare value would keep
// showing A's 북극성 문장, star count and piece count to B until B's own loads
// land, and could even leave on B's card. Reading through `ownedBy` turns any
// other owner's value into "not loaded yet" in the very first render after the
// switch (QA 261004 SG-02).
type Owned<T> = { ownerId: string; value: T };

function ownedBy<T>(held: Owned<T> | null, ownerId: string | null): T | null {
  return held !== null && ownerId !== null && held.ownerId === ownerId ? held.value : null;
}

export default function ShareCardScreen() {
  // Phone-aware: inside the dashboard phone, back steps the phone, and the
  // on-screen preview fits the phone's display (the 1080 capture host is unchanged).
  const router = useAppRouter();
  const embed = usePhoneEmbed();
  const previewSize = embed?.displayWidth ? Math.min(330, Math.floor(embed.displayWidth - spacing.lg * 2)) : 330;
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading } = useAuth();
  const isKo = i18n.language === "ko";

  const [variant, setVariant] = useState<"A" | "B">("A");
  const [heldLitStars, setHeldLitStars] = useState<Owned<number> | null>(null);
  const [heldPieceCount, setHeldPieceCount] = useState<Owned<number | null> | null>(null);
  // med#31: the card ignored the user's saved 북극성 문장 — always the canned
  // default. med#32: a star-count load FAILURE fell through to 4 fabricated
  // stars on a SHARE surface (정직한 밝기 violation) — it is an error state now.
  const [heldSentence, setHeldSentence] = useState<Owned<string | null> | null>(null);
  const [failedOwner, setFailedOwner] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const captureRef = useRef<View>(null);

  useEffect(() => {
    if (!userId) return;
    const owner = userId;
    let alive = true;
    setFailedOwner(null);
    loadDomainLevels(owner)
      .then((b) => {
        if (!alive) return;
        const lit = Object.values(b.domainLevels).filter((level) => (level ?? 1) >= 2).length;
        setHeldLitStars({ ownerId: owner, value: lit });
      })
      .catch(() => {
        // med#32: don't render fabricated fallback stars — surface the failure.
        if (alive) setFailedOwner(owner);
      });
    // med#31: the user's own 북극성 문장 (newest NORTHSTAR record). Optional —
    // a miss just keeps the honest default insight line. An answer with no
    // sentence is kept too: it is this owner's "none", not a gap to fill with
    // the sentence an earlier load (or an earlier account) left behind.
    void fetchCurrentNorthstar(owner)
      .then((s) => {
        if (alive) setHeldSentence({ ownerId: owner, value: s.sentence || null });
      })
      .catch(() => {});
    // Signature line count — countUserPieces resolves null on failure, so no catch.
    void countUserPieces(owner).then((n) => {
      if (alive) setHeldPieceCount({ ownerId: owner, value: n });
    });
    return () => {
      alive = false;
    };
  }, [userId, retryKey]);

  const litStars = ownedBy(heldLitStars, userId);
  const pieceCount = ownedBy(heldPieceCount, userId);
  const sentence = ownedBy(heldSentence, userId);
  const loadFailed = userId !== null && failedOwner === userId;

  const barTitle = t("deepspace:shareCard.barTitle");

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={t("deepspace:shareCard.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  // med#32: a failed star load renders an error + retry, never invented stars.
  if (loadFailed) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
        <View style={styles.center}>
          <Text variant="body" accessibilityRole="alert">{t("home:ds.axisCheck.loadError")}</Text>
          <MdButton variant="tonal" label={t("home:ds.axisCheck.retry")} onPress={() => setRetryKey((k) => k + 1)} />
        </View>
      </DeepSpaceScreen>
    );
  }

  // QA 261004 W-04/D-09: the default sentence comes from the bundle (it was a
  // Korean constant), and an unknown star count stays unknown. Until the count
  // loads, the preview waits and nothing can be exported, so no card ever leaves
  // with invented stars.
  const card = deriveCardProps({
    litStars,
    northStarSentence: sentence,
    fallbackInsight: t("deepspace:shareCard.fallbackInsight"),
  });
  const litCount = card.litCount;

  async function handleShare() {
    if (sharing || saving || litCount === null) return;
    setSharing(true);
    try {
      await shareInsightCard({
        variant,
        insight: card.insight,
        handle: card.handle,
        litCount,
        viewRef: captureRef.current ?? undefined,
      });
    } finally {
      setSharing(false);
    }
  }

  // "이미지 저장": capture the 1080 card and hand it to the OS export sheet, which
  // surfaces Save-to-Photos/Download. Same off-screen capture ref as 공유; without
  // an added media-library dep the OS sheet is the honest save affordance.
  async function handleSave() {
    if (sharing || saving || litCount === null) return;
    setSaving(true);
    try {
      await shareInsightCard({
        variant,
        insight: card.insight,
        handle: card.handle,
        litCount,
        viewRef: captureRef.current ?? undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* rev2 sb-more copy verbatim */}
        <Text variant="caption" color="textSubtle" style={styles.introCopy}>
          {t("deepspace:shareCard.introExport")}
        </Text>

        <View style={styles.chipRow}>
          <MdChip kind="filter" label={t("deepspace:shareCard.variantInsight")} selected={variant === "A"} onPress={() => setVariant("A")} />
          <MdChip
            kind="filter"
            label={t("deepspace:shareCard.variantConstellation")}
            selected={variant === "B"}
            onPress={() => setVariant("B")}
          />
        </View>

        <View style={styles.preview}>
          {litCount === null ? (
            <PremiumLoadingState message={t("deepspace:shareCard.loading")} />
          ) : (
            <ShareCard variant={variant} insight={card.insight} pieceCount={pieceCount} litCount={litCount} size={previewSize} isKo={isKo} />
          )}
        </View>

        {/* sb-more L503-506: two side-by-side actions — filled 이미지 저장 + tonal 공유. */}
        <View style={styles.actionRow}>
          <MdButton
            variant="filled"
            disabled={saving || sharing || litCount === null}
            label={saving ? t("deepspace:shareCard.saving") : t("deepspace:shareCard.saveImage")}
            onPress={handleSave}
            style={styles.actionBtn}
          />
          <MdButton
            variant="tonal"
            disabled={sharing || saving || litCount === null}
            label={sharing ? t("deepspace:shareCard.opening") : t("deepspace:shareCard.share")}
            onPress={handleShare}
            style={styles.actionBtn}
          />
        </View>
        <Text variant="caption" color="textSubtle" style={styles.introCopy}>
          {t("deepspace:shareCard.introPrivacy")}
        </Text>

        {/* Off-screen capture host at 1080x1080 (react-native-view-shot needs a
            mounted view; the lib captures THIS ref, the preview above stays
            responsive). Kept out of the a11y tree. Mounted only once the real
            star count is known. */}
        {litCount !== null ? (
          <View style={styles.captureHost} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View ref={captureRef} collapsable={false}>
              <ShareCard variant={variant} insight={card.insight} pieceCount={pieceCount} litCount={litCount} size={1080} isKo={isKo} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  preview: { alignItems: "center" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1 },
  chipRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  introCopy: { textAlign: "center" },
  captureHost: { position: "absolute", left: -4000, top: 0, opacity: 0 },
});
