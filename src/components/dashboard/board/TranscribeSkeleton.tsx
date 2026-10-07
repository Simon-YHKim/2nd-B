// S-02 녹음 전사 - 화면 골격만(PS-DASH-001 v2.2, W2 에 연다).
//
// 녹음 코드는 없다. 시작 화면의 안내("내가 참여한 대화만")와, 끝난 뒤 보일 자리(머리 -> 할 일 · 다음 연락 ->
// 전문 -> [저장][버리기])의 틀만 그린다. 독의 녹음 전사는 W2 전까지 잠겨 있어 이 화면으로 오는 길이 없다.
// 성인만(발주 2). 상시 녹음은 하지 않는다(F2 반려, 통비법).

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import { boardTone } from "@/lib/dashboard/board/tone";
import { m3 } from "@/lib/theme/m3";

function Text({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.text, style]} />;
}

const LATER_SECTIONS = ["head", "todos", "transcript"] as const;

export function TranscribeSkeleton({ adult }: { adult: boolean }) {
  const { t } = useTranslation("ops");
  const locked = boardTone("locked");
  if (!adult) return <View testID="board-transcribe" style={styles.page}>
    <Text variant="heading" accessibilityRole="header">{t("phone.board.transcribe.title")}</Text>
    <Text variant="body" style={styles.muted}>{t("phone.board.transcribe.adultOnly")}</Text>
  </View>;
  return <View testID="board-transcribe" style={styles.page}>
    <Text variant="heading" accessibilityRole="header">{t("phone.board.transcribe.title")}</Text>
    <View style={[styles.notice, { borderColor: locked.border }]}>
      <PixelGlyph name="mic" size={18} color={m3.color.onSurfaceVariant} />
      <Text variant="body" style={styles.flex}>{t("phone.board.transcribe.ownTalkOnly")}</Text>
    </View>
    <View accessibilityRole="button" accessibilityLabel={t("phone.board.transcribe.lockedStart")} accessibilityState={{ disabled: true }}
      style={[styles.start, { borderColor: locked.border, borderStyle: locked.borderStyle }]}>
      <PixelGlyph name="lock" size={18} color={locked.text} />
      <Text variant="body" style={{ color: locked.text }}>{t("phone.board.transcribe.lockedStart")}</Text>
    </View>
    <Text variant="caption" style={styles.muted}>{t("phone.board.transcribe.afterTitle")}</Text>
    {LATER_SECTIONS.map((section) => <View key={section} style={[styles.slot, { borderColor: locked.border, borderStyle: locked.borderStyle }]}>
      <Text variant="caption" style={{ color: locked.text }}>{t(`phone.board.transcribe.sections.${section}`)}</Text>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  text: { color: m3.color.onSurface },
  page: { gap: 10 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, padding: 10, backgroundColor: m3.color.surfaceContainer },
  flex: { flex: 1, flexShrink: 1 },
  muted: { color: m3.color.onSurfaceVariant },
  start: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
  slot: { minHeight: 56, borderWidth: 1, padding: 10, justifyContent: "center" },
});
