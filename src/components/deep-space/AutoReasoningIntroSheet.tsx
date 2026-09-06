// First-ON explainer for automatic reasoning (spec docs/reasoning-ux-spec_260718.html
// 화면 A 인터랙션: "처음 ON: 소비 규칙을 설명하는 bottom sheet 확인 후 활성화").
// The switch must NOT flip on the first tap — the consumption rules (automatic
// runs spend the weekly base, one manual run always reserved) get confirmed
// here first, then the caller enables the pref. Declining leaves it OFF.
//
// Same overlay discipline as ReasoningLimitSheet (O-7): a bottom sheet, never
// a modal over content; the caller's screen state stays mounted behind it.

import { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text as RNText, View, useWindowDimensions } from "react-native";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { MdButton } from "@/components/m3";
import { m3 } from "@/lib/theme/m3";
import { m3TextStyle } from "@/components/m3/typeface";
import { deepSpace, flattenAlpha, withAlpha } from "@/lib/theme/tokens";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `deepSpace.bgMid` — 시트 표면.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const arAlpha = (c: string, a: number): string => flattenAlpha(c, a, deepSpace.bgMid);

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
      duration: 320, easing: pixelStepsFor(320),
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
          <RNText style={[styles.line, m3TextStyle("bodyMedium")]}>{copy.groupLine}</RNText>
          <RNText style={[styles.line, m3TextStyle("bodyMedium")]}>{copy.limitLine}</RNText>
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
    backgroundColor: arAlpha(m3.color.onSurfaceVariant, 0.4),
    alignSelf: "center",
    marginBottom: m3.spacing.s4,
  },
  // 얼굴·크기·줄간격은 캐논 역할에서 온다(m3TextStyle). 전에는 여기서
  // Pretendard 를 직접 박아 저시력 옵션과 무관하게 항상 벡터 얼굴이었고,
  // 18/26 은 Galmuri 격자 밖이었다. titleLarge = 15px(Galmuri14 x1)/23.
  // 굵기는 보내지 않는다 - Galmuri14 에는 굵은 컷이 없고, 합성 굵기는 격자를 깬다.
  title: {
    ...m3TextStyle("titleLarge"),
    color: m3.color.onSurface,
    textAlign: "center",
  },
  // 읽는 글이라 얼굴·크기는 bodyMedium 역할에서 온다 - 단 **렌더 때** 붙인다.
  // StyleSheet.create 는 모듈 초기화 때 한 번 얼기 때문에, 여기서 m3TextStyle 을
  // 부르면 저시력 옵션 값이 그 시점에 박제된다(check:pixel-rules 규칙 4가 잡는다).
  // 그래서 이 시트에는 색·정렬만 두고, 타이포는 콜사이트에서 합친다.
  line: {
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
    marginTop: m3.spacing.s3,
  },
  actions: { gap: m3.spacing.s4, marginTop: m3.spacing.s5 },
  actionButton: { width: "100%" },
});
