// PIXEL-CLAY 시간 선택 시트 (Simon 2026-09-30, /data-connections).
//
// Simon 원문: "시간 설정 창이 팝업 되며 첨부하는 [이미지] 와 같은 시간 설정 창을 띄우되,
// 디자인은, 우리 앱에 맞게 수정 적용한다." 참조 사진의 구성(오전/오후 · 시 · 분 휠과
// 가로 전체 저장 버튼)은 그대로 두고 옷만 바꾼다: 둥근 모서리 대신 잘린 모서리 베벨,
// 청록 선 대신 primary 2px 막대, 반투명 스크림 대신 75% 디더.
//
// 아래에서 올라오는 시트다. 한 번의 탭은 화면을 단순하게 만들어야 한다는 규칙
// (CLAUDE.md 정보 밀도)에 따라 노드 위 작은 모달이 아니라 화면 아래를 차지한다.
// 닫는 길: 닫기 글리프, 스크림 누르기, 안드로이드 뒤로(onRequestClose), 웹 Esc.
// 값은 호출부가 소유한다. 시트는 초안만 들고 있다가 저장할 때 "HH:MM" 하나를 넘긴다.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, Modal, Platform, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { m3TextStyle } from "@/components/m3/typeface";
import { PlainText as Text } from "@/components/ui/PlainText";
import { m3 } from "@/lib/theme/m3";

import { PixelScrim } from "./PixelDither";
import { PixelGlyph } from "./PixelGlyph";
import { PixelPressable } from "./PixelPressable";
import { PixelSurface } from "./PixelSurface";
import { PixelWheel } from "./PixelWheel";
import {
  clockText,
  formatMinute,
  hourWheelLabels,
  minuteValues,
  parseClock,
  parseClockPattern,
  periodOfHour,
  withPeriod,
} from "./time-wheel";

/** 참조 휠과 같은 5분 간격. 간격 밖의 저장값은 `minuteValues` 가 끼워 넣는다. */
const MINUTE_STEP = 5;

export interface PixelTimeSheetProps {
  visible: boolean;
  /** 지금 저장된 값. 24시간 "HH:MM". */
  value: string;
  title: string;
  onCancel: () => void;
  onSave: (value: string) => void;
  /** 저장 중이면 저장 버튼을 잠근다. */
  busy?: boolean;
  /** 마지막 저장이 실패했을 때 저장 버튼 위에 보이는 글. */
  error?: string | null;
}

export function PixelTimeSheet({ visible, value, title, onCancel, onSave, busy = false, error = null }: PixelTimeSheetProps) {
  const { t } = useTranslation("common");
  const insets = useSafeAreaInsets();
  const pattern = useMemo(() => parseClockPattern(t("timePicker.pattern")), [t]);
  // 초안은 24시간제 한 벌로 든다. 12시간제의 시 칸도 24칸을 돌기 때문에 오전/오후가 따라온다.
  const [draft, setDraft] = useState(() => parseClock(value));

  // 열 때마다 저장된 값에서 다시 시작한다. 닫았다 열면 버린 초안이 남지 않는다.
  useEffect(() => {
    if (visible) setDraft(parseClock(value));
  }, [visible, value]);

  // 웹의 Modal 이 Esc 를 onRequestClose 로 넘기는지 확인하지 못했다. 그래서 직접 듣는다.
  useEffect(() => {
    if (Platform.OS !== "web" || !visible || typeof document === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, onCancel]);

  // role=alert 만으로는 TalkBack · VoiceOver 가 새로 나타난 저장 실패를 읽지 않는다.
  useEffect(() => {
    if (visible && error && Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(error);
  }, [visible, error]);

  const hourLabels = useMemo(() => hourWheelLabels(pattern), [pattern]);
  const hourSpoken = useMemo(
    () => hourLabels.map((_, hour24) => t("timePicker.hourValue", { value: pattern.hour12 ? hour24 % 12 || 12 : hour24 })),
    [hourLabels, pattern.hour12, t],
  );
  // 분 목록은 저장된 값 기준으로 한 번 정한다. 끄는 동안 목록이 바뀌면 칸이 튄다.
  const minutes = useMemo(() => minuteValues(MINUTE_STEP, parseClock(value).minute), [value]);
  const minuteSpoken = useMemo(() => minutes.map((minute) => t("timePicker.minuteValue", { value: minute })), [minutes, t]);

  const columns: ReactNode[] = [];
  pattern.parts.forEach((part, at) => {
    if (part === "minute" && pattern.parts[at - 1] === "hour" && pattern.separator) {
      // 시와 분 사이 글자는 그림일 뿐이다. 스크린리더 정지가 되지 않게 모든 플랫폼에서 숨긴다.
      columns.push(
        <Text
          key="separator"
          style={styles.separator}
          accessible={false}
          aria-hidden
          importantForAccessibility="no"
        >{pattern.separator}</Text>,
      );
    }
    if (part === "period") {
      columns.push(
        <PixelWheel
          key="period"
          labels={[t("timePicker.am"), t("timePicker.pm")]}
          index={periodOfHour(draft.hour24)}
          onChange={(next) => setDraft((current) => ({ ...current, hour24: withPeriod(current.hour24, next === 1 ? 1 : 0) }))}
          accessibilityLabel={t("timePicker.period")}
        />,
      );
    } else if (part === "hour") {
      columns.push(
        <PixelWheel
          key="hour"
          labels={hourLabels}
          spokenLabels={hourSpoken}
          index={draft.hour24}
          onChange={(next) => setDraft((current) => ({ ...current, hour24: next }))}
          accessibilityLabel={t("timePicker.hour")}
          wrap
        />,
      );
    } else {
      columns.push(
        <PixelWheel
          key="minute"
          labels={minutes.map(formatMinute)}
          spokenLabels={minuteSpoken}
          index={Math.max(0, minutes.indexOf(draft.minute))}
          onChange={(next) => setDraft((current) => ({ ...current, minute: minutes[next] ?? current.minute }))}
          accessibilityLabel={t("timePicker.minute")}
          wrap
        />,
      );
    }
  });

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        {/* 스크림은 Pressable 이 아니라 응답자 View 다. RN-web 은 Pressable 에 늘 tabIndex 0 을 주고
            Modal 의 포커스 트랩이 첫 요소에 포커스를 넣어서, 이름 없는 전체 화면 칸이 포커스를 받고
            Enter 한 번에 초안이 버려졌다(리뷰 실측). 이 View 는 탭 정지가 아니다. */}
        <View
          accessible={false}
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onCancel}
        >
          <PixelScrim style={styles.scrimImage} />
        </View>
        <View accessibilityViewIsModal onAccessibilityEscape={onCancel} style={styles.sheetColumn}>
          <PixelSurface
            variant="bevel"
            background={m3.color.surfaceContainer}
            contentStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, m3.spacing.s8) + m3.spacing.s4 }]}
          >
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              <PixelPressable
                variant="frame"
                onPress={onCancel}
                accessibilityLabel={t("actions.close")}
                contentStyle={styles.closeContent}
              >
                <PixelGlyph name="close" color={m3.color.primary} size={24} />
              </PixelPressable>
            </View>
            <View style={styles.wheels}>{columns}</View>
            {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
            <PixelPressable
              fullWidth
              disabled={busy}
              background={m3.color.primary}
              onPress={() => onSave(clockText(draft.hour24, draft.minute))}
              accessibilityLabel={t("actions.save")}
              accessibilityState={{ busy }}
              contentStyle={styles.saveContent}
            >
              <Text style={styles.saveText}>{t("actions.save")}</Text>
            </PixelPressable>
          </PixelSurface>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  // PolarisCardOverlay 와 같은 크기 지정. absoluteFill 만 주면 웹에서 디더가 4x4 타일에
  // 머물러 뒤 화면이 어두워지지 않는다.
  scrimImage: { width: "100%", height: "100%" },
  sheetColumn: { width: "100%", maxWidth: 520, alignSelf: "center", zIndex: 301 },
  sheetContent: { paddingTop: m3.spacing.s6, paddingHorizontal: m3.spacing.s8, gap: m3.spacing.s6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: m3.spacing.s6 },
  title: { ...m3TextStyle("headlineSmall"), color: m3.color.onSurface, flex: 1 },
  closeContent: { minWidth: m3.minTouch, minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  wheels: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  separator: { ...m3TextStyle("headlineSmall"), color: m3.color.onSurface },
  error: { ...m3TextStyle("labelLarge"), color: m3.color.error },
  saveContent: { minHeight: m3.minTouch + m3.spacing.s4, alignItems: "center", justifyContent: "center" },
  saveText: { ...m3TextStyle("titleMedium"), color: m3.color.onPrimary },
});
