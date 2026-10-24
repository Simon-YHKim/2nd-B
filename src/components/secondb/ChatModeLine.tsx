import { Platform, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { PhoneView as View } from "@/components/phone/PhoneUIKit";
import { modeSwitchPersona } from "@/lib/chat/mode-switch";
import type { Rev2PersonaId } from "@/lib/chat/rev2-personas";
import { semantic, spacing } from "@/lib/theme/tokens";

/** No transcript entry or visible copy; PhoneView maps the border inside the phone. */
export function ChatModeLine({ previousPersona, persona }: {
  previousPersona: Rev2PersonaId | undefined;
  persona: Rev2PersonaId | undefined;
}) {
  const { t } = useTranslation("secondb");
  const nextPersona = modeSwitchPersona(previousPersona, persona);
  if (nextPersona === null) return null;
  return (
    <View testID="chat-mode-line" accessible accessibilityRole="text"
      role={Platform.OS === "web" ? "separator" : undefined}
      accessibilityLabel={t(`rev2.${nextPersona}.lensName`)} style={styles.line} />
  );
}

const styles = StyleSheet.create({
  line: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.textSubtle,
    marginVertical: spacing.sm,
  },
});
