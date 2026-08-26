// Pre-assessment intro shown when entering BFI / MBTI / ECR-S. Tells the
// user how many items they're about to answer, how long it'll take, and
// what the result will do — so they don't bail mid-way.
//
// Driven by AsyncStorage so the modal only shows once per tool (unless the
// user explicitly resets it). The "skip next time" choice is implicit: the
// modal returns false if dismissed without onStart.

import { useEffect, useRef, useState } from "react";
import { Modal, View, StyleSheet, Pressable } from "react-native";
import { PixelScrim } from "@/components/pixel/PixelDither";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { CompanionSprite } from "@/components/art/CompanionSprite";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { useTranslation } from "react-i18next";

export interface QuantIntroProps {
  /** Storage key used to remember "don't show again" preference. */
  toolKey: "bfi" | "mbti" | "ecr" | "ipip" | "rlss" | "values" | "strengths" | "motivation";
  title: string;
  itemCount: number;
  /**
   * Items per page, mirroring what the caller hands QuantPager. The page count
   * below used to hardcode /5, which is right for only 2 of the 7 instruments —
   * /strengths, /values and /motivation paginate by 4, /ipip-neo by 8 and /rlss
   * shows every item at once, so those five promised a page count the pager then
   * contradicted (strengths said 2, showed 3). Defaults to 5 so a caller that
   * does not paginate keeps the old number.
   */
  perPage?: number;
  estimatedMinutes: number;
  /** Short description of the tool, what it measures, who it's for. */
  description: string;
  /** Optional academic citation line, shown smaller below description. */
  citation?: string;
  /** Optional disclaimer (used for MBTI's "weak validity" caveat). */
  disclaimer?: string;
  locale: "en" | "ko";
  onStart: () => void;
  onCancel: () => void;
}

// `null` while loading, true once we know the modal should display.
function useShouldShow(toolKey: string): { visible: boolean | null; markSeen: () => Promise<void> } {
  const [visible, setVisible] = useState<boolean | null>(null);
  const storageKey = `quant-intro-seen:${toolKey}`;
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((seen) => {
        if (!cancelled) setVisible(seen !== "1");
      })
      .catch(() => {
        // Fallback to showing the modal if storage is unavailable.
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);
  const markSeen = async () => {
    try {
      await AsyncStorage.setItem(storageKey, "1");
    } catch (e) {
      // Best-effort; failing storage shouldn't block flow — but leave a
      // trace, or "intro keeps reappearing" bugs are undiagnosable.
      if (typeof console !== "undefined") console.warn("[quant-intro] persist failed", e);
    }
  };
  return { visible, markSeen };
}

export function QuantIntroModal({
  toolKey,
  title,
  itemCount,
  perPage = 5,
  estimatedMinutes,
  description,
  citation,
  disclaimer,
  locale,
  onStart,
  onCancel,
}: QuantIntroProps) {
  const { t } = useTranslation("common");
  const { visible, markSeen } = useShouldShow(toolKey);
  const [dontShow, setDontShow] = useState(false);
  const autoStartedRef = useRef(false);

  async function handleStart() {
    if (dontShow) await markSeen();
    onStart();
  }

  // Auto-start if user previously dismissed and chose "don't show again".
  // We call onStart once the modal is hidden so the parent knows the intro is
  // done. Running it in an effect (not render) keeps the side-effect out of
  // render and fires it only after commit.
  useEffect(() => {
    if (visible === false && !autoStartedRef.current) {
      autoStartedRef.current = true;
      onStart();
    }
  }, [onStart, visible]);

  if (visible !== true) {
    return null;
  }

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
      {/* 모달 스크림은 디더다 — 바탕을 모르는 자리라 평탄화가 아니라 격자로 가린다
          (PIXEL-CLAY 규칙 4). 반투명이 한 픽셀도 없다. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <PixelScrim />
      </View>
        <View
          style={styles.card}
          accessibilityViewIsModal
          accessibilityLabel={title}
          accessibilityHint={description}
        >
          <View style={styles.introHeader}>
            <CompanionSprite companion="momo" state="read" size={52} />
            <View style={styles.introHeaderText}>
              {/* KO eyebrow drops tracking to 0 (Hangul reads worse when
                  tracked); EN keeps the stylized caption tracking. */}
              <Text variant="caption" color="brand" style={{ letterSpacing: locale === "ko" ? 0 : 1.5 }}>
                {t("quantBeforeStart")}
              </Text>
              <Text variant="heading" style={{ marginTop: spacing.xs }}>{title}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <Stat
              label={t("quantItems")}
              value={`${itemCount}`}
            />
            <View style={styles.statDivider} />
            <Stat
              label={t("quantTime")}
              value={locale === "ko" ? `약 ${estimatedMinutes}분` : `~${estimatedMinutes} min`}
            />
            <View style={styles.statDivider} />
            <Stat
              label={t("quantPages")}
              value={`${Math.max(1, Math.ceil(itemCount / Math.max(1, perPage)))}`}
            />
          </View>

          <Text variant="body" color="textMuted" style={{ marginTop: spacing.md }}>{description}</Text>

          {citation ? (
            <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.sm }}>{citation}</Text>
          ) : null}

          {disclaimer ? (
            <View style={styles.disclaimerCard}>
              <Text variant="subtle" color="textMuted">{disclaimer}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => setDontShow((v) => !v)}
            style={styles.dontShowRow}
            hitSlop={14}
            accessibilityRole="checkbox"
            accessibilityLabel={t("quantSkipIntro")}
            accessibilityState={{ checked: dontShow }}
          >
            <View style={[styles.checkbox, dontShow && styles.checkboxOn]} />
            <Text variant="subtle" color="textMuted">
              {t("quantSkipIntro")}
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <Button
              label={t("quantStart")}
              variant="primary"
              onPress={handleStart}
            />
            <Button
              label={t("quantNotNow")}
              variant="secondary"
              onPress={onCancel}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" color="textMuted">{label}</Text>
      <Text variant="body" style={{ fontWeight: "600", marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.lg,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    // Android ignores shadow* — the card is opaque (semantic.surface), so an
    // elevation gives it the matching depth instead of rendering flat.
    elevation: 0,
  },
  introHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  introHeaderText: { flex: 1 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.surfaceAlt,
    borderRadius: 0,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, alignSelf: "stretch", backgroundColor: semantic.border, opacity: 0.5 },
  disclaimerCard: {
    marginTop: spacing.md,
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.sm,
  },
  dontShowRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: m3.shape.none,
    borderWidth: 1.5,
    borderColor: semantic.textSubtle,
  },
  checkboxOn: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
