import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/ui/Text";
import { deepSpace } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { PremiumButton } from "./surfaces";
import { SecondbHead } from "@/components/deepspace";

type SceneHeroAction = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export function SceneHero({
  eyebrow,
  title,
  subtitle,
  speech,
  primaryAction,
  secondaryAction,
  style,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  speech: string;
  primaryAction?: SceneHeroAction;
  secondaryAction?: SceneHeroAction;
  style?: StyleProp<ViewStyle>;
}) {
  // 2026-06-02: village headers show the TITLE only — eyebrow + subtitle are no
  // longer rendered. Kept in the props for API compatibility with the callers.
  void eyebrow;
  void subtitle;
  return (
    <View style={[dsStyles.wrap, style]}>
      <View style={dsStyles.headerRow}>
        <SecondbHead size={52} mood="neutral" />
        <View style={dsStyles.bubble}>
          <View style={dsStyles.bubbleTail} />
          <Text variant="body" style={dsStyles.bubbleText}>{speech}</Text>
        </View>
      </View>
      <Text variant="heading" style={dsStyles.title}>{title}</Text>
      {primaryAction || secondaryAction ? (
        <View style={dsStyles.actions}>
          {primaryAction ? (
            <PremiumButton
              label={primaryAction.label}
              variant={primaryAction.variant ?? "primary"}
              loading={primaryAction.loading}
              disabled={primaryAction.disabled}
              onPress={primaryAction.onPress}
            />
          ) : null}
          {secondaryAction ? (
            <PremiumButton
              label={secondaryAction.label}
              variant={secondaryAction.variant ?? "secondary"}
              loading={secondaryAction.loading}
              disabled={secondaryAction.disabled}
              onPress={secondaryAction.onPress}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// SecondB head + speech bubble + title. The legacy pixel-village island/worker
// layout (and its patrol + swipe hooks) left with the `EXPO_PUBLIC_UI=legacy`
// lever on 2026-10-05 (Simon decision Q-261004-11); it is in E:/Legacy/2ndB
// (MANIFEST batch qa261004-lever) and git history.
const dsStyles = StyleSheet.create({
  // paddingTop clears the floating BackArrow chip (SceneHero only renders on
  // pushed sub-screens, where the arrow is shown).
  wrap: { gap: 12, paddingTop: 52 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  bubble: {
    flex: 1,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    borderTopLeftRadius: 0,
    borderTopRightRadius: m3.shape.medium,
    borderBottomRightRadius: m3.shape.medium,
    borderBottomLeftRadius: m3.shape.medium,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  bubbleTail: {
    position: "absolute",
    left: -5,
    top: 14,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: deepSpace.cardLine,
  },
  bubbleText: { color: deepSpace.textHi, fontSize: 14, lineHeight: 19 },
  title: { fontSize: 20, color: deepSpace.textHi },
  actions: { gap: 8, marginTop: 4 },
});
