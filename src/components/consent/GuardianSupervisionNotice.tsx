import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { PlainText as Text } from "@/components/ui/PlainText";
import { m3 } from "@/lib/theme/m3";
import { guardianSupervisionColor } from "./guardian-supervision-color";

interface GuardianSupervisionNoticeProps {
  emphasized?: boolean;
  style?: StyleProp<TextStyle>;
}

export function GuardianSupervisionNotice({
  emphasized = false,
  style,
}: GuardianSupervisionNoticeProps) {
  const { t } = useTranslation("consent");
  const notice = t("notice.guardianSupervision");

  return (
    <Text
      style={[styles.notice, style, { color: m3.color[guardianSupervisionColor(emphasized)] }]}
      accessibilityLabel={notice}
    >
      {notice}
    </Text>
  );
}

const styles = StyleSheet.create({
  notice: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
  },
});
