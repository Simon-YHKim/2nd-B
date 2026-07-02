// 공유 카드 (rev2 P5c): the "자기이해 한 컷" share surface. The ShareCard
// component + 1080x1080 capture lib shipped earlier with NO entry point — this
// route surfaces them: A/B variant preview, live litStars from the user's real
// domain levels, and the OS share sheet via shareInsightCard (web falls back to
// a text share; capture uses the pre-mounted off-screen host, per the lib note).
// Privacy: the card carries ONE sentence + star count + handle. Nothing else.
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, SegBtn } from "@/components/m3";
import { ShareCard } from "@/components/deepspace/ShareCard";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing } from "@/lib/theme/tokens";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import { deriveCardProps, shareInsightCard } from "@/lib/share/insight-card";

export default function ShareCardScreen() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const isKo = i18n.language === "ko";

  const [variant, setVariant] = useState<"A" | "B">("A");
  const [litStars, setLitStars] = useState<number | null>(null);
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
    return () => {
      alive = false;
    };
  }, [userId]);

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
    <DeepSpaceScreen active="lens">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="heading">{isKo ? "공유 카드" : "Share card"}</Text>
        <Text variant="caption" color="textSubtle">
          {isKo
            ? "한 문장과 별 개수만 담겨요. 기록 내용은 카드에 실리지 않아요."
            : "One sentence and a star count. None of your records leave with it."}
        </Text>

        <SegBtn
          segments={[
            { key: "A", label: isKo ? "문장 중심" : "Insight" },
            { key: "B", label: isKo ? "별자리 중심" : "Constellation" },
          ]}
          selected={[variant]}
          onSelect={(key) => setVariant(key === "B" ? "B" : "A")}
        />

        <View style={styles.preview}>
          <ShareCard variant={variant} insight={card.insight} handle={card.handle} litCount={card.litCount} size={320} />
        </View>

        <MdButton
          variant="filled"
          disabled={sharing}
          label={sharing ? (isKo ? "여는 중…" : "Opening…") : isKo ? "공유하기" : "Share"}
          onPress={handleShare}
        />
        {litStars === null ? (
          <Text variant="caption" color="textSubtle">
            {isKo ? "별 개수를 못 읽어 기본값으로 그렸어요." : "Could not read your stars; drew the default."}
          </Text>
        ) : null}

        {/* Off-screen capture host at 1080x1080 (react-native-view-shot needs a
            mounted view; the lib captures THIS ref, the preview above stays
            responsive). Kept out of the a11y tree. */}
        <View style={styles.captureHost} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View ref={captureRef} collapsable={false}>
            <ShareCard variant={variant} insight={card.insight} handle={card.handle} litCount={card.litCount} size={1080} />
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
  captureHost: { position: "absolute", left: -4000, top: 0, opacity: 0 },
});
