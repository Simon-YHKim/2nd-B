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
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const isKo = i18n.language === "ko";

  const [variant, setVariant] = useState<"A" | "B">("A");
  const [litStars, setLitStars] = useState<number | null>(null);
  const [pieceCount, setPieceCount] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
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

  const barTitle = isKo ? "공유 카드" : "Share card";

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={isKo ? "불러오는 중이에요…" : "Loading…"} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const card = deriveCardProps({ litStars });

  async function handleShare() {
    if (sharing) return;
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

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* rev2 sb-more copy verbatim */}
        <Text variant="caption" color="textSubtle" style={styles.introCopy}>
          {isKo
            ? "1080×1080 정사각 카드로 내보내요. 원문은 빼고, 보여줄 한 줄만 담겨요."
            : "Exports as a 1080×1080 square card. Raw notes stay out; only the one line you choose goes in."}
        </Text>

        <View style={styles.chipRow}>
          <MdChip kind="filter" label={isKo ? "통찰 카드" : "Insight card"} selected={variant === "A"} onPress={() => setVariant("A")} />
          <MdChip
            kind="filter"
            label={isKo ? "별자리 카드" : "Constellation card"}
            selected={variant === "B"}
            onPress={() => setVariant("B")}
          />
        </View>

        <View style={styles.preview}>
          <ShareCard variant={variant} insight={card.insight} pieceCount={pieceCount} litCount={card.litCount} size={330} isKo={isKo} />
        </View>

        <MdButton
          variant="filled"
          disabled={sharing}
          label={sharing ? (isKo ? "여는 중…" : "Opening…") : isKo ? "공유" : "Share"}
          onPress={handleShare}
        />
        <Text variant="caption" color="textSubtle" style={styles.introCopy}>
          {isKo
            ? "기록 원문·수치는 카드에 포함되지 않아요. 보여줄 문장만 골라 담아요."
            : "Raw records and numbers never go on the card. Only the sentence you pick."}
        </Text>
        {litStars === null ? (
          <Text variant="caption" color="textSubtle" style={styles.introCopy}>
            {isKo ? "별 개수를 못 읽어 기본값으로 그렸어요." : "Could not read your stars; drew the default."}
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
  chipRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  introCopy: { textAlign: "center" },
  captureHost: { position: "absolute", left: -4000, top: 0, opacity: 0 },
});
