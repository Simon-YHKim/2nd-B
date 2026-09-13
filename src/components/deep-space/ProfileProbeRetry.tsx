// 프로필 프로브가 실패했을 때 화면이 보이는 자리 (vibe r260914 R3-A).
//
// T1a 에뮬레이터 검증(vibe r260913 항목 2)에서 첫 프로브가 실패하면 /account ·
// /data 가 로딩 캡션만 남기고 멈췄다. 오류 문구도 Retry 도 뒤로 버튼도 없었고,
// 네트워크를 되살려도 돌아오지 않았다. 같은 조건에서 /audit 만 오류 문구 + Retry 를
// 보였다(dds-audit-screen.tsx 의 StatePanel). 그 모양을 공용으로 만든 것이 이 파일이다.
// 판정은 `profileGate`(lib/auth/profile-probe.ts)가 한다.
//
// Retry 는 AuthContext.refresh() 다. 세션을 다시 읽고 프로필을 다시 묻는다.
// 서버가 답하면 게이트가 원래 화면을 그리고 이 부품은 사라진다.
//
// ⚠ 이 자리에서 "프로필 있음" 으로 통과시키지 않는다. 실패는 모름이고, 모름에서는
// 기능 화면(LLM 표면 포함)을 열지 않는다(C10). 그래서 여기에는 **도크도 기능 라우트로
// 가는 링크도 없다.** 처음에는 DeepSpaceScreen 안에 그려 도크가 붙어 있었고, 그 도크가
// 프로필을 모르는 채 /records · /settings · /import-hub 로 가는 길이었다(r3a 게이트 발견).
// 할 수 있는 일은 다시 묻기, 이 계정에서 나가기(로그아웃), 뒤로 가기뿐이다. 뒤로 간 곳이
// 기능 라우트여도 라우트 게이트(app/_layout.tsx 의 IntroGate · ProfileProbeScope)가 다시 붙든다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { MdTopAppBar } from "@/components/m3/MdTopAppBar";
import { PixelGateShell } from "@/components/pixel/PixelGateShell";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import { m3 } from "@/lib/theme/m3";

/** 딥링크로 들어와 돌아갈 곳이 없으면 홈으로 간다. 홈도 실패 중이면 라우트 게이트가 같은 다시 시도를 보인다. */
function backOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * 오류 문구 + Retry + 로그아웃. 틀(제목 · 뒤로)은 ProfileProbeRetryScreen 이 가진다.
 *
 * 문구는 원인을 단정하지 않는다. 여기 오는 실패에는 네트워크만이 아니라 서버 시계 차이
 * (`JWT issued at future`) · 권한 · 서버 오류도 있어서, 처음 쓰던 연결 문구("인터넷 상태를
 * 확인해 주세요")는 사람에게 맞지 않는 조치를 시켰다(r3a 게이트 발견). 원격 오류 원문은
 * 화면에 올리지 않는다.
 */
export function ProfileProbeRetryPanel() {
  const { t } = useTranslation(["common"]);
  const { refresh } = useAuth();
  const [pending, setPending] = useState<"retry" | "signOut" | null>(null);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 한 번 누르면 답이 올 때까지 한 번만 보낸다. 연타가 프로브를 겹쳐 보내지 않게 한다.
  // 다시 시도와 로그아웃도 서로 겹치지 않는다.
  const onRetry = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPending("retry");
    setSignOutFailed(false);
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        inFlightRef.current = false;
        if (mountedRef.current) setPending(null);
      });
  }, [refresh]);

  // 다시 물어도 답이 오지 않을 때 이 계정에서 나가는 길. 성공하면 AuthContext 가 로그아웃을
  // 게시하고, 라우트 게이트가 붙들기를 풀어 로그인으로 보낸다. 여기서 따로 이동하지 않는다.
  // 전역 게이트 안에서는 이동을 받을 네비게이터가 마운트돼 있지 않다.
  const onSignOut = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPending("signOut");
    setSignOutFailed(false);
    void signOut()
      .catch(() => {
        if (mountedRef.current) setSignOutFailed(true);
      })
      .finally(() => {
        inFlightRef.current = false;
        if (mountedRef.current) setPending(null);
      });
  }, []);

  const retryLabel = t("common:actions.retry");
  const signOutLabel = t("common:actions.signOut");
  const busy = pending !== null;
  return (
    <PixelSurface variant="frame" style={styles.surface} contentStyle={styles.content}>
      <PixelGlyph name="warning" color={m3.color.primary} size={24} />
      <Text variant="body" accessibilityRole="alert" style={styles.message}>
        {t("common:errors.profileProbe")}
      </Text>
      <PixelPressable
        fullWidth
        variant="bevel"
        onPress={onRetry}
        disabled={busy}
        accessibilityLabel={retryLabel}
        accessibilityState={{ busy: pending === "retry" }}
        contentStyle={styles.actionContent}
      >
        <PixelGlyph
          name="refresh"
          color={busy ? m3.disabled.onSurface : m3.color.onSurface}
          size={18}
        />
        <Text variant="body" style={busy ? styles.actionTextBusy : styles.actionText}>
          {retryLabel}
        </Text>
      </PixelPressable>
      <PixelPressable
        fullWidth
        variant="bevel"
        onPress={onSignOut}
        disabled={busy}
        accessibilityLabel={signOutLabel}
        accessibilityState={{ busy: pending === "signOut" }}
        contentStyle={styles.actionContent}
      >
        <Text variant="body" style={busy ? styles.actionTextBusy : styles.actionText}>
          {signOutLabel}
        </Text>
      </PixelPressable>
      {signOutFailed ? (
        <Text variant="body" accessibilityRole="alert" style={styles.message}>
          {t("common:errors.unknown")}
        </Text>
      ) : null}
    </PixelSurface>
  );
}

/**
 * 게이트 셸 판본(도크 없음). `title` 을 주면 제목과 뒤로 가기가 붙는다. 제목 줄은
 * 네비게이터 포커스를 쓰므로 장면 안에서만 준다. 안 주면 다시 시도 패널만 둔다 -
 * 전역 게이트(IntroGate · ProfileProbeScope)와 홈 · 대화 같은 도크의 뿌리 탭이 그렇다.
 */
export function ProfileProbeRetryScreen({
  title,
  onBack,
}: {
  title?: string;
  onBack?: () => void;
}) {
  return (
    <PixelGateShell contentContainerStyle={styles.shell}>
      {title === undefined ? null : <MdTopAppBar title={title} onBack={onBack ?? backOrHome} />}
      <View style={styles.center}>
        <ProfileProbeRetryPanel />
      </View>
    </PixelGateShell>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  center: {
    flex: 1,
    justifyContent: "center",
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
