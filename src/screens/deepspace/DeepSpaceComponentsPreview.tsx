import { StyleSheet, Text, View } from "react-native";

import { SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export function DeepSpaceComponentsPreview() {
  return (
    <View style={styles.screen}>
      <View style={styles.phone}>
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>9:41</Text>
          <Text style={styles.statusText}>●●● ▮</Text>
        </View>
        <SecondbStatusHeader
          mood="positive"
          text="오늘도 왔네요. 지금의 당신이 별 7개로 빛나고 있어요."
          tip="가장 어두운 별부터 채워보면 좋아요."
        />
        <View style={styles.body}>
          <SecondbHead mood="positive" size={72} />
          <SecondbHead mood="neutral" size={72} />
          <SecondbHead mood="negative" size={72} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 40,
    backgroundColor: colors.bgDeep,
  },
  phone: {
    position: "relative",
    width: 320,
    minHeight: 680,
    overflow: "hidden",
    borderRadius: radius.phone,
    backgroundColor: colors.bgDeep,
    borderWidth: 1,
    borderColor: colors.borderHi,
    shadowColor: colors.bgDeep,
    shadowOpacity: 0.6,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 30 },
    elevation: 10,
  },
  statusBar: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 14,
  },
  statusText: {
    color: colors.textMid,
    fontFamily: fontFamilies.pixelKo,
    fontSize: 11,
    lineHeight: 16,
  },
  body: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    paddingTop: 80,
  },
});
