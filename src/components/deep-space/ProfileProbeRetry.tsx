// 프로필 프로브가 실패했을 때 화면이 보이는 자리 (vibe r260914 R3-A).
//
// T1a 에뮬레이터 검증(vibe r260913 항목 2)에서 첫 프로브가 실패하면 /account ·
// /data 가 로딩 캡션만 남기고 멈췄다. 오류 문구도 Retry 도 도크도 뒤로 버튼도
// 없었고, 네트워크를 되살려도 돌아오지 않았다. 같은 조건에서 /audit 만 오류 문구 +
// Retry + 도크를 보였다(dds-audit-screen.tsx 의 StatePanel). 그 모양을 공용으로
// 만든 것이 이 파일이다. 판정은 `profileGate`(lib/auth/profile-probe.ts)가 한다.
//
// Retry 는 AuthContext.refresh() 다. 세션을 다시 읽고 프로필을 다시 묻는다.
// 서버가 답하면 게이트가 원래 화면을 그리고 이 부품은 사라진다.
//
// ⚠ 이 자리에서 "프로필 있음" 으로 통과시키지 않는다. 실패는 모름이고, 모름에서는
// 기능 화면(LLM 표면 포함)을 열지 않는다(C10). 여기서 할 수 있는 일은 다시 묻기와
// 도크 · 뒤로 가기로 떠나기뿐이다.
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { m3 } from "@/lib/theme/m3";

import type { DeepSpaceTab } from "./DeepSpaceDock";
import { DeepSpaceScreen } from "./DeepSpaceScreen";

/** 딥링크로 들어와 돌아갈 곳이 없으면 홈으로 간다. 홈도 실패 중이면 같은 다시 시도를 보인다. */
function backOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** 오류 문구 + Retry. 틀(도크 · 제목)은 부르는 화면이 가진다. */
export function ProfileProbeRetryPanel() {
  const { t } = useTranslation(["common"]);
  const { refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 한 번 누르면 답이 올 때까지 한 번만 보낸다. 연타가 프로브를 겹쳐 보내지 않게 한다.
  const onRetry = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRetrying(true);
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        inFlightRef.current = false;
        if (mountedRef.current) setRetrying(false);
      });
  }, [refresh]);

  const retryLabel = t("common:actions.retry");
  return (
    <PixelSurface variant="frame" style={styles.surface} contentStyle={styles.content}>
      <PixelGlyph name="warning" color={m3.color.primary} size={24} />
      <Text variant="body" accessibilityRole="alert" style={styles.message}>
        {t("common:errors.network")}
      </Text>
      <PixelPressable
        fullWidth
        variant="bevel"
        onPress={onRetry}
        disabled={retrying}
        accessibilityLabel={retryLabel}
        accessibilityState={{ busy: retrying }}
        contentStyle={styles.actionContent}
      >
        <PixelGlyph
          name="refresh"
          color={retrying ? m3.disabled.onSurface : m3.color.onSurface}
          size={18}
        />
        <Text variant="body" style={retrying ? styles.actionTextBusy : styles.actionText}>
          {retryLabel}
        </Text>
      </PixelPressable>
    </PixelSurface>
  );
}

/**
 * 도크가 있는 화면 판본. `title` 을 주면 /audit 처럼 제목과 뒤로 가기가 붙고,
 * 안 주면(홈 · 대화 같은 도크의 뿌리 탭) 도크만 둔다.
 */
export function ProfileProbeRetryScreen({
  active,
  title,
  onBack,
}: {
  active: DeepSpaceTab;
  title?: string;
  onBack?: () => void;
}) {
  const body = (
    <View style={styles.center}>
      <ProfileProbeRetryPanel />
    </View>
  );
  if (title === undefined) {
    return (
      <DeepSpaceScreen active={active} header="none">
        {body}
      </DeepSpaceScreen>
    );
  }
  return (
    <DeepSpaceScreen
      active={active}
      header="none"
      variant="windowed"
      title={title}
      onBack={onBack ?? backOrHome}
    >
      {body}
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    padding: m3.spacing.s4,
  },
  surface: { width: "100%" },
  content: { gap: m3.spacing.s3, alignItems: "flex-start" },
  message: {
    color: m3.color.onSurfaceVariant,
    lineHeight: m3.type.bodyMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
  },
  actionText: { flex: 1, color: m3.color.onSurface, textAlign: "center" },
  actionTextBusy: { flex: 1, color: m3.disabled.onSurface, textAlign: "center" },
});
