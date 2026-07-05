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
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdChip } from "@/components/m3";
import { ShareCard } from "@/components/deepspace/ShareCard";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing } from "@/lib/theme/tokens";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import { deriveCardProps, shareInsightCard } from "@/lib/share/insight-card";
import { countUserPieces } from "@/lib/share/piece-count";

export default function ShareCardScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading } = useAuth();
  const isKo = i18n.language === "ko";

  const [variant, setVariant] = useState<"A" | "B">("A");
  const [litStars, setLitStars] = useState<number | null>(null);
  const [pieceCount, setPieceCount] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const captureRef = useRef<View>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadDomainLevels(userId)
      .then((b) => {
        if (!alive) return;
        const lit = Object.values(b.domainLevels).filter((level) => (level ?? 1) >= 2).length;
        setLitStars(lit);
      })
      .catch(() => {
        if (alive) setLitStars(null);
      });
    // Signature line count — countUserPieces resolves null on failure, so no catch.
    void countUserPieces(userId).then((n) => {
      if (alive) setPieceCount(n);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

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

  const card = deriveCardProps({ litStars });

  async function handleShare() {
    if (sharing || saving) return;
    setSharing(true);
    try {
      await shareInsightCard({
        variant,
        insight: card.insight,
        handle: card.handle,
        litCount: card.litCount,
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
    if (sharing || saving) return;
    setSaving(true);
    try {
      await shareInsightCard({
        variant,
        insight: card.insight,
        handle: card.handle,
        litCount: card.litCount,
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
          <ShareCard variant={variant} insight={card.insight} pieceCount={pieceCount} litCount={card.litCount} size={330} isKo={isKo} />
        </View>

        {/* sb-more L503-506: two side-by-side actions — filled 이미지 저장 + tonal 공유. */}
        <View style={styles.actionRow}>
          <MdButton
            variant="filled"
            disabled={saving || sharing}
            label={saving ? t("deepspace:shareCard.saving") : t("deepspace:shareCard.saveImage")}
            onPress={handleSave}
            style={styles.actionBtn}
          />
          <MdButton
            variant="tonal"
            disabled={sharing || saving}
            label={sharing ? t("deepspace:shareCard.opening") : t("deepspace:shareCard.share")}
            onPress={handleShare}
            style={styles.actionBtn}
          />
        </View>
        <Text variant="caption" color="textSubtle" style={styles.introCopy}>
          {t("deepspace:shareCard.introPrivacy")}
        </Text>
        {litStars === null ? (
          <Text variant="caption" color="textSubtle" style={styles.introCopy}>
            {t("deepspace:shareCard.starsFallback")}
          </Text>
        ) : null}

        {/* Off-screen capture host at 1080x1080 (react-native-view-shot needs a
            mounted view; the lib captures THIS ref, the preview above stays
            responsive). Kept out of the a11y tree. */}
        <View style={styles.captureHost} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View ref={captureRef} collapsable={false}>
            <ShareCard variant={variant} insight={card.insight} pieceCount={pieceCount} litCount={card.litCount} size={1080} isKo={isKo} />
          </View>
        </View>
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
