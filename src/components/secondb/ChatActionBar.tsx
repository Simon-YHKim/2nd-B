import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { PhoneView as View, PhoneScrollView as ScrollView, PhonePressable as Pressable } from "@/components/phone/PhoneUIKit";
import { Text } from "@/components/ui/Text";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { deepSpace } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

export interface ChatAction {
  id: string;
  label: string;
  hint?: string;
  onPress: () => void;
  recommended?: boolean;
  disabled?: boolean;
  busy?: boolean;
}

/** Intrinsic-height dock: horizontal ScrollViews must not share transcript flex. */
export function ChatActionBar({ actions }: { actions: readonly ChatAction[] }) {
  const scrollerRef = useRef<ScrollView>(null);
  const firstActionId = actions[0]?.id;
  useEffect(() => {
    // A newly promoted action must be visible even after browsing the row.
    scrollerRef.current?.scrollTo({ x: 0, animated: false });
  }, [firstActionId]);
  if (!actions.length) return null;
  return (
    <View style={styles.host} testID="chat-action-bar">
      <ScrollView ref={scrollerRef} horizontal style={styles.scroller} contentContainerStyle={styles.row}
        showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {actions.map(action => (
          <Pressable key={action.id} onPress={action.onPress} disabled={action.disabled}
            testID={`chat-action-${action.id}`} accessibilityRole="button"
            accessibilityLabel={action.label} accessibilityHint={action.hint}
            accessibilityState={{ disabled: !!action.disabled, busy: !!action.busy }}
            style={[styles.chip, action.recommended && styles.recommended]}>
            {action.recommended ? <PixelGlyph name="star" size={14} color={m3.color.onPrimary} /> : null}
            <Text style={[styles.label, action.recommended && styles.recommendedLabel]}>{action.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { height: 52, flexGrow: 0, flexShrink: 0 },
  scroller: { flexGrow: 0, flexShrink: 0 },
  row: { alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  chip: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    minHeight: 44, paddingHorizontal: 12, borderWidth: 1,
    borderColor: deepSpace.cardLine, backgroundColor: deepSpace.card,
  },
  recommended: { borderColor: m3.color.primary, backgroundColor: m3.color.primary },
  label: { color: deepSpace.accentSoft, fontSize: 11 },
  recommendedLabel: { color: m3.color.onPrimary, fontWeight: "700" },
});
