// 사업자 정보 푸터 (PIXEL-CLAY auth 목적지 captures/auth.png 하단).
//
// 값은 src/lib/legal/business-info.ts 의 BUSINESS_INFO 에서 오고, 등록 전(null)
// 에는 아무것도 그리지 않는다. 라벨만 로케일(deepspace:auth.business.*)이다.
// 스타일은 자체 StyleSheet 다: screens/deepspace/dds-styles 를 components 에서
// 끌어오면 방향이 거꾸로라 require cycle 의 씨앗이 된다(check:cycles 0 허용).

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { colors, spacing } from "@/theme/tokens";
import { Text } from "@/components/ui/Text";
import { BUSINESS_INFO, businessFooterLines, type BusinessLabels } from "@/lib/legal/business-info";

export function BusinessFooter() {
  const { t } = useTranslation("deepspace");
  const labels: BusinessLabels = {
    company: t("auth.business.company"),
    ceo: t("auth.business.ceo"),
    address: t("auth.business.address"),
    bizNo: t("auth.business.bizNo"),
    mailOrderNo: t("auth.business.mailOrderNo"),
    privacyOfficer: t("auth.business.privacyOfficer"),
    phone: t("auth.business.phone"),
  };
  const lines = businessFooterLines(BUSINESS_INFO, labels);
  if (lines.length === 0) return null;

  return (
    <View style={styles.root} accessible accessibilityLabel={lines.map((l) => `${l.label} ${l.value}`).join(", ")}>
      {lines.map((line) => (
        <Text key={line.field} variant="subtle" style={styles.line}>
          {line.label}: {line.value}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  line: {
    color: colors.textLo,
    fontSize: 11,
    lineHeight: 16,
  },
});
