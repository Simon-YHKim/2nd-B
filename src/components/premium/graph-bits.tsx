// Premium graph / chat building blocks (Part 1): the reference shard card
// (참고한 별가루), graph node chip (village island label + gold count), the
// character badge (companion avatar with a glow ring), and the context pill
// shown when the chat is entered from a node.

import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { gameboy, pixelShadowStyle } from "@/lib/theme/gameboy-tokens";
import { cosmic, spacing, typography, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { CHARACTERS, type CharacterId } from "@/lib/characters";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { CompanionSprite, type CompanionName } from "@/components/art/CompanionSprite";

function useCurrentLocale(): "en" | "ko" {
  const { i18n } = useTranslation();
  return i18n.language === "ko" ? "ko" : "en";
}

/** A "참고한 별가루" card — what an answer / center drew on. */
export const ReferenceShardCard = memo(function ReferenceShardCard({
  title,
  meta,
  onPress,
  accent = cosmic.pixelLamp,
}: {
  title: string;
  meta?: string;
  onPress?: () => void;
  accent?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.shard, pressed && onPress ? { opacity: 0.8 } : null]}
    >
      <View style={[styles.shardGem, { backgroundColor: accent }, pixelShadowStyle(accent)]} />
      <View style={styles.shardText}>
        <Text variant="body" numberOfLines={2} style={styles.shardTitle}>{title}</Text>
        {meta ? <Text variant="subtle" color="textSubtle" numberOfLines={2}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
});

/** Village island label chip with an optional warm-gold shard count. */
export const GraphNodeChip = memo(function GraphNodeChip({
  label,
  count,
  accent = cosmic.signalMint,
  active = false,
  onPress,
  style,
}: {
  label: string;
  count?: number;
  accent?: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const locale = useCurrentLocale();
  const countLabel =
    count == null
      ? label
      : locale === "ko"
        ? `${label}, 별가루 ${count}`
        : `${label}, ${count} ${count === 1 ? "piece" : "pieces"}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={countLabel}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: active ? accent : gameboy.border },
        active ? styles.chipActive : null,
        active ? pixelShadowStyle(accent) : null,
        pressed && onPress ? { opacity: 0.82 } : null,
        style,
      ]}
    >
      <View style={[styles.chipDot, { backgroundColor: accent }]} />
      <Text variant="caption" numberOfLines={2} style={styles.chipLabel}>{label}</Text>
      {count != null ? <Text variant="caption" style={{ color: cosmic.pixelLamp }}>+{count}</Text> : null}
    </Pressable>
  );
});

const COMPANION_ACCENT: Record<CharacterId, string> = {
  secondb: cosmic.soulViolet,
  momo: cosmic.moonWhite, // Narrative — monochrome
  lulu: cosmic.signalMint,
  archi: cosmic.signalBlue,
  gadi: cosmic.pixelLamp, // Bond / Relia — amber
  lumi: cosmic.dreamPink, // Muse / Lumina
};

/** Companion avatar with a glowing ring. SecondB uses its own sprite. */
export function CharacterBadge({ id, size = 48, label, glow = true }: { id: CharacterId; size?: number; label?: boolean; glow?: boolean }) {
  const locale = useCurrentLocale();
  const accent = COMPANION_ACCENT[id];
  const meta = CHARACTERS[id];
  return (
    <View style={styles.badgeWrap} accessible accessibilityRole="image" accessibilityLabel={meta.name[locale]}>
      <View
        style={[
          styles.badgeRing,
          { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2, borderColor: accent },
          glow ? pixelShadowStyle(accent) : null,
        ]}
      >
        {id === "secondb" ? (
          <SecondBSprite state="idle" size={size} />
        ) : (
          <CompanionSprite companion={id as CompanionName} state="idle" size={size} />
        )}
      </View>
      {label ? <Text variant="subtle" color="textMuted" style={{ marginTop: 4 }}>{meta.name[locale]}</Text> : null}
    </View>
  );
}

/** Context pill — "○○에서 질문" when chat is entered from a node. */
export function ContextPill({ label, onClose }: { label: string; onClose?: () => void }) {
  const locale = useCurrentLocale();
  const contextLabel = locale === "ko" ? `${label}에서 질문` : `Question from ${label}`;
  const clearLabel = locale === "ko" ? "컨텍스트 지우기" : "Clear context";
  return (
    <View style={styles.pill} accessibilityLabel={contextLabel}>
      <View style={[styles.chipDot, { backgroundColor: cosmic.soulViolet }]} />
      <Text variant="caption" color="textMuted" style={styles.pillText} numberOfLines={2}>
        {contextLabel}
      </Text>
      {onClose ? (
        <Pressable
          onPress={onClose}
          style={styles.pillClose}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
        >
          <Text variant="caption" color="textSubtle">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small reusable stat tile (count + label) — used in node sheets / center. */
export function StatTile({ value, label, accent = cosmic.signalMint }: { value: ReactNode; label: string; accent?: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="heading" style={{ color: accent, fontSize: typography.sizes.lg }}>{value}</Text>
      <Text variant="subtle" color="textSubtle" numberOfLines={2} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: withAlpha(cosmic.space950, 0.5),
    borderColor: gameboy.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.sm,
    ...pixelShadowStyle(),
  },
  shardGem: { width: 10, height: 10, borderRadius: gameboy.radius },
  shardText: { flex: 1, minWidth: 0 },
  shardTitle: { fontFamily: fontFamilies.pixelKo, fontWeight: "600" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: withAlpha(cosmic.space900, 0.7),
    minHeight: 44,
  },
  chipActive: { backgroundColor: withAlpha(cosmic.signalMint, 0.08) },
  chipLabel: { flexShrink: 1, minWidth: 0 },
  chipDot: { width: 7, height: 7, borderRadius: gameboy.radius },
  badgeWrap: { alignItems: "center" },
  badgeRing: {
    borderWidth: gameboy.borderWidth,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(cosmic.space900, 0.6),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: gameboy.borderWidth,
    borderColor: gameboy.border,
    backgroundColor: withAlpha(cosmic.soulViolet, 0.1),
    borderRadius: gameboy.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...pixelShadowStyle(cosmic.soulViolet),
  },
  pillText: { flex: 1, minWidth: 0 },
  pillClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: gameboy.radius,
  },
  stat: { alignItems: "center", gap: 2, minWidth: 64 },
  statLabel: { textAlign: "center" },
});
