// First-ON explainer for automatic reasoning (spec docs/reasoning-ux-spec_260718.html
// 화면 A 인터랙션: "처음 ON: 소비 규칙을 설명하는 bottom sheet 확인 후 활성화").
// The switch must NOT flip on the first tap — the consumption rules (automatic
// runs spend the weekly base, one manual run always reserved) get confirmed
// here first, then the caller enables the pref. Declining leaves it OFF.
//
// Same overlay discipline as ReasoningLimitSheet (O-7): a bottom sheet, never
// a modal over content; the caller's screen state stays mounted behind it.

import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text as RNText, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { MdButton } from "@/components/m3";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export interface AutoReasoningIntroSheetProps {
  visible: boolean;
  ko: boolean;
  /** User confirmed the rules — the caller flips the pref ON and marks seen. */
  onConfirm: () => void;
  /** Dismissed without enabling (veil tap or "not now"). */
  onClose: () => void;
}

type DisplayLocale = "en" | "ko" | "es" | "pt" | "id";

const DISPLAY_LOCALES = new Set<DisplayLocale>(["en", "ko", "es", "pt", "id"]);

const COPY: Record<
  DisplayLocale,
  {
    close: string;
    title: string;
    groupLine: string;
    limitLine: string;
    confirm: string;
    later: string;
  }
> = {
  en: {
    close: "Close",
    title: "Turn on automatic reasoning",
    groupLine: "SecondB groups new items and proposes connections.",
    limitLine: "Automatic runs use one weekly run and always reserve one for manual use.",
    confirm: "Turn on",
    later: "Not now",
  },
  ko: {
    close: "닫기",
    title: "자동 리즈닝을 켜요",
    groupLine: "새 자료를 모아 세컨비가 연결을 제안해요.",
    limitLine: "자동 실행도 주간 한도를 1회씩 사용해요. 직접 실행할 1회는 항상 남겨 둬요.",
    confirm: "켜기",
    later: "나중에",
  },
  es: {
    close: "Cerrar",
    title: "Activar razonamiento automático",
    groupLine: "SecondB agrupa los elementos nuevos y propone conexiones.",
    limitLine: "Cada ejecución automática usa una vez semanal y siempre reserva una para uso manual.",
    confirm: "Activar",
    later: "Ahora no",
  },
  pt: {
    close: "Fechar",
    title: "Ativar raciocínio automático",
    groupLine: "O SecondB agrupa novos itens e propõe conexões.",
    limitLine: "Cada execução automática usa um limite semanal e sempre reserva uma para uso manual.",
    confirm: "Ativar",
    later: "Agora não",
  },
  id: {
    close: "Tutup",
    title: "Aktifkan penalaran otomatis",
    groupLine: "SecondB mengelompokkan item baru dan mengusulkan koneksi.",
    limitLine: "Setiap proses otomatis memakai satu jatah mingguan dan selalu menyisakan satu untuk manual.",
    confirm: "Aktifkan",
    later: "Nanti saja",
  },
};

function displayLocale(language: string, ko: boolean): DisplayLocale {
  const base = language.split("-")[0] as DisplayLocale;
  if (DISPLAY_LOCALES.has(base)) return base;
  return ko ? "ko" : "en";
}

export function AutoReasoningIntroSheet({ visible, ko, onConfirm, onClose }: AutoReasoningIntroSheetProps) {
  const { i18n } = useTranslation();
  const { height } = useWindowDimensions();
  // Modal 은 화면의 SafeAreaView 밖에서 그려진다 — 인셋을 직접 읽는다.
  // 인셋이 0인 기기(대부분의 안드로이드)에서도 s6 만큼은 남는다.
  const insets = useSafeAreaInsets();
  const sheetBottom = Math.max(insets.bottom, m3.spacing.s6);
  const rise = useRef(new Animated.Value(0)).current;
  const copy = COPY[displayLocale(i18n.language, ko)];

  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.timing(rise, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, rise]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.veil}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={copy.close}
        />
        <Animated.View style={[styles.sheet, { paddingBottom: sheetBottom }, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          <RNText style={styles.title}>{copy.title}</RNText>
          <RNText style={styles.line}>{copy.groupLine}</RNText>
          <RNText style={styles.line}>{copy.limitLine}</RNText>
          <View style={styles.actions}>
            <MdButton
              label={copy.confirm}
              variant="filled"
              onPress={onConfirm}
              style={styles.actionButton}
            />
            <MdButton
              label={copy.later}
              variant="text"
              onPress={onClose}
              style={styles.actionButton}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  veil: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(m3.color.scrim, 0.6) },
  sheet: {
    borderTopLeftRadius: m3.shape.extraLarge,
    borderTopRightRadius: m3.shape.extraLarge,
    borderTopWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: m3.color.surfaceContainerHigh,
    paddingTop: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s5,
  // ⚠ 이 시트는 `<Modal transparent statusBarTranslucent>` 안이라 화면의
  // SafeAreaView 밖에서 그려진다. 그래서 이 paddingBottom 이 **홈 인디케이터까지의
  // 유일한 여백**이다. `--u` 2px 이주로 s6 가 24 -> 12 가 되면 iOS 34pt 인디케이터
  // 영역 안에 버튼이 들어간다. 인셋을 실제로 읽어서 더한다 (`sheetBottom` 참조).
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: m3.shape.none,
    backgroundColor: withAlpha(m3.color.onSurfaceVariant, 0.4),
    alignSelf: "center",
    marginBottom: m3.spacing.s4,
  },
  title: {
    color: m3.color.onSurface,
    fontFamily: fontFamilies.readable,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  line: {
    color: m3.color.onSurfaceVariant,
    fontFamily: fontFamilies.readable,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: m3.spacing.s3,
  },
  actions: { gap: m3.spacing.s4, marginTop: m3.spacing.s5 },
  actionButton: { width: "100%" },
});
