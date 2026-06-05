// Pre-assessment intro shown when entering BFI / MBTI / ECR-S. Tells the
// user how many items they're about to answer, how long it'll take, and
// what the result will do — so they don't bail mid-way.
//
// Driven by AsyncStorage so the modal only shows once per tool (unless the
// user explicitly resets it). The "skip next time" choice is implicit: the
// modal returns false if dismissed without onStart.

import { useEffect, useState } from "react";
import { Modal, View, StyleSheet, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { CompanionSprite } from "@/components/art/CompanionSprite";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";

export interface QuantIntroProps {
  /** Storage key used to remember "don't show again" preference. */
  toolKey: "bfi" | "mbti" | "ecr";
  title: string;
  itemCount: number;
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
function useShouldShow(toolKey: string): { visible: boolean; markSeen: () => Promise<void> } {
  const [visible, setVisible] = useState(true);
  const storageKey = `quant-intro-seen:${toolKey}`;
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((seen) => {
        if (!cancelled) setVisible(seen !== "1");
      })
      .catch(() => {
        // Fallback to showing the modal if storage is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);
  const markSeen = async () => {
    try {
      await AsyncStorage.setItem(storageKey, "1");
    } catch {
      // Best-effort; failing storage shouldn't block flow.
    }
  };
  return { visible, markSeen };
}

export function QuantIntroModal({
  toolKey,
  title,
  itemCount,
  estimatedMinutes,
  description,
  citation,
  disclaimer,
  locale,
  onStart,
  onCancel,
}: QuantIntroProps) {
  const { visible, markSeen } = useShouldShow(toolKey);
  const [dontShow, setDontShow] = useState(false);

  async function handleStart() {
    if (dontShow) await markSeen();
    onStart();
  }

  if (!visible) {
    // Auto-start if user previously dismissed and chose "don't show again".
    // We still call onStart once on mount so the parent knows the modal is
    // done. Using a microtask keeps the call out of render.
    Promise.resolve().then(onStart);
    return null;
  }

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.introHeader}>
            <CompanionSprite companion="momo" state="read" size={52} />
            <View style={styles.introHeaderText}>
              {/* KO eyebrow drops tracking to 0 (Hangul reads worse when
                  tracked); EN keeps the stylized caption tracking. */}
              <Text variant="caption" color="brand" style={{ letterSpacing: locale === "ko" ? 0 : 1.5 }}>
                {locale === "ko" ? "시작 전 안내" : "Before you start"}
              </Text>
              <Text variant="heading" style={{ marginTop: spacing.xs }}>{title}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <Stat
              label={locale === "ko" ? "문항" : "Items"}
              value={`${itemCount}`}
            />
            <View style={styles.statDivider} />
            <Stat
              label={locale === "ko" ? "소요" : "Time"}
              value={locale === "ko" ? `약 ${estimatedMinutes}분` : `~${estimatedMinutes} min`}
            />
            <View style={styles.statDivider} />
            <Stat
              label={locale === "ko" ? "페이지" : "Pages"}
              value={`${Math.ceil(itemCount / 5)}`}
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

          <Pressable onPress={() => setDontShow((v) => !v)} style={styles.dontShowRow} hitSlop={6}>
            <View style={[styles.checkbox, dontShow && styles.checkboxOn]} />
            <Text variant="subtle" color="textMuted">
              {locale === "ko" ? "다음부터 이 안내 건너뛰기" : "Skip this intro next time"}
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <Button
              label={locale === "ko" ? "시작" : "Start"}
              variant="primary"
              onPress={handleStart}
            />
            <Button
              label={locale === "ko" ? "나중에" : "Not now"}
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
    backgroundColor: "rgba(2, 4, 10, 0.78)",
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
    borderRadius: radii.md,
    padding: spacing.lg,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  introHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  introHeaderText: { flex: 1 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
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
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  dontShowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: semantic.textSubtle,
  },
  checkboxOn: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
