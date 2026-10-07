// S-02 녹음 전사 - 화면 골격만(PS-DASH-001 v2.2, W2 에 연다).
//
// 녹음 코드는 없다. 시작 화면의 안내("내가 참여한 대화만")와, 끝난 뒤 보일 자리(머리 -> 할 일 · 다음 연락 ->
// 전문 -> [저장][버리기])의 틀만 그린다. 독의 녹음 전사는 W2 전까지 잠겨 있어 이 화면으로 오는 길이 없다.
// 성인만(발주 2). 상시 녹음은 하지 않는다(F2 반려, 통비법). 모양은 픽셀 아이폰(iOS 묶음 목록).

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { boardTone } from "@/lib/dashboard/board/tone";
import { phoneIos } from "@/lib/theme/phone-ios";
import { IosGroup, IosLargeTitle, IosLead, IosRow, IosSectionHeader, IosText } from "./IosParts";

const LATER_SECTIONS = ["head", "todos", "transcript"] as const;

export function TranscribeSkeleton({ adult }: { adult: boolean }) {
  const { t } = useTranslation("ops");
  const locked = boardTone("locked");
  if (!adult) return <View testID="board-transcribe" style={styles.page}>
    <IosLargeTitle>{t("phone.board.transcribe.title")}</IosLargeTitle>
    <IosText variant="body" style={styles.muted}>{t("phone.board.transcribe.adultOnly")}</IosText>
  </View>;
  return <View testID="board-transcribe" style={styles.page}>
    <IosLargeTitle>{t("phone.board.transcribe.title")}</IosLargeTitle>
    <IosGroup>
      <IosRow title={t("phone.board.transcribe.ownTalkOnly")} lead={<IosLead color={phoneIos.red} glyph="mic" />} />
    </IosGroup>
    <View accessibilityRole="button" accessibilityLabel={t("phone.board.transcribe.lockedStart")} accessibilityState={{ disabled: true }}>
      <PixelRoundRect fill={locked.fill} style={styles.start}>
        <View pointerEvents="none" style={[styles.dashed, { borderColor: locked.border }]} />
        <PixelGlyph name="lock" size={18} color={locked.text} />
        <IosText variant="body" style={{ color: locked.text }}>{t("phone.board.transcribe.lockedStart")}</IosText>
      </PixelRoundRect>
    </View>
    <IosSectionHeader>{t("phone.board.transcribe.afterTitle")}</IosSectionHeader>
    <IosGroup>
      {LATER_SECTIONS.map((section) => <IosRow key={section} title={t(`phone.board.transcribe.sections.${section}`)}
        lead={<IosLead color={phoneIos.gray3} glyph="lock" />} />)}
    </IosGroup>
  </View>;
}

const styles = StyleSheet.create({
  page: { gap: 10 },
  muted: { color: phoneIos.label2 },
  start: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  dashed: { position: "absolute", top: 4, right: 4, bottom: 4, left: 4, borderWidth: 2, borderStyle: "dashed" },
});
