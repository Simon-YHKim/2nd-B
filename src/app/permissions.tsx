// Permissions transparency screen. Surfaces exactly what device
// capabilities the app uses, does not use, and may add later.
// Apple App Store + Google Play Console both require a clear privacy
// declaration before listing — this page is the source of truth.

import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Link } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { VILLAGE_UI } from "@/lib/village-ui";

type Status = "in_use" | "optional" | "planned" | "not_used";

interface PermissionEntry {
  name: { en: string; ko: string };
  status: Status;
  why: { en: string; ko: string };
  platform: "web" | "native" | "both" | "none";
}

const ENTRIES: PermissionEntry[] = [
  {
    name: { en: "Network access", ko: "네트워크 접근" },
    status: "in_use",
    platform: "both",
    why: {
      en: "Required for sign-in, saving your data, and AI answers. Standard HTTPS.",
      ko: "로그인, 데이터 저장, AI 답변에 필요합니다. 표준 HTTPS.",
    },
  },
  {
    name: { en: "Device notifications", ko: "기기 알림" },
    status: "not_used",
    platform: "none",
    why: {
      en: "Not requested in this build. Daily reminders stay off until a real notification feature is added and reviewed.",
      ko: "현재 빌드에서는 요청하지 않습니다. 실제 알림 기능이 추가되고 검토되기 전까지 매일 리마인더는 꺼져 있습니다.",
    },
  },
  {
    name: { en: "Clipboard", ko: "클립보드" },
    status: "optional",
    platform: "web",
    why: {
      en: "Tap 'Copy' on the wiki Export and on SecondB bubbles. Only fires when you tap; we never read clipboard.",
      ko: "위키 익스포트와 세컨비 말풍선의 '복사' 동작. 탭할 때만 작동하며, 클립보드를 읽지 않습니다.",
    },
  },
  {
    name: { en: "Calendar", ko: "캘린더" },
    status: "planned",
    platform: "native",
    why: {
      en: "A future reminder feature may offer optional calendar access. It is not requested today, and would ask first.",
      ko: "향후 리마인더 기능에서 선택 캘린더 접근을 제공할 수 있습니다. 현재는 요청하지 않으며, 추가되면 먼저 허락을 구합니다.",
    },
  },
  {
    name: { en: "Camera / Photo library", ko: "카메라 / 사진 보관함" },
    status: "optional",
    platform: "native",
    why: {
      en: "Optional, for text capture from images only. Asked when you choose a photo action; decline and the rest of the app still works.",
      ko: "선택 권한이며 이미지에서 텍스트를 담을 때만 사용합니다. 사진 동작을 선택할 때 요청하고, 거절해도 나머지 기능은 그대로 동작합니다.",
    },
  },
  {
    name: { en: "Microphone", ko: "마이크" },
    status: "not_used",
    platform: "none",
    why: {
      en: "Not requested. No voice or audio capture in scope.",
      ko: "요청하지 않습니다. 음성·오디오 캡처는 범위 밖.",
    },
  },
  {
    name: { en: "Location", ko: "위치" },
    status: "not_used",
    platform: "none",
    why: {
      en: "Not requested. The app has no location-based features.",
      ko: "요청하지 않습니다. 위치 기반 기능 없음.",
    },
  },
  {
    name: { en: "Contacts / SMS", ko: "연락처 / 문자" },
    status: "not_used",
    platform: "none",
    why: {
      en: "Not requested. No social or messaging features.",
      ko: "요청하지 않습니다. 소셜이나 메시징 기능 없음.",
    },
  },
];

const STATUS_LABEL: Record<Status, { en: string; ko: string; color: keyof typeof semantic }> = {
  in_use: { en: "In use", ko: "사용 중", color: "brand" },
  optional: { en: "Optional", ko: "선택", color: "info" },
  planned: { en: "Planned", ko: "계획", color: "warning" },
  not_used: { en: "Not used", ko: "사용 안 함", color: "textSubtle" },
};

export default function Permissions() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "권한 안내" : "Permissions"}
          title={locale === "ko" ? "필요한 접근만 밝히고 써요" : "Use only what is needed"}
          subtitle={locale === "ko" ? "네트워크 · 클립보드 · 선택 사진 접근" : "Network · clipboard · optional photo access"}
          island={VILLAGE_UI.relation.island}
          worker={VILLAGE_UI.relation.worker}
          accent={VILLAGE_UI.relation.accent}
          speech={
            locale === "ko"
              ? "권한은 기능이 필요할 때만 요청하고, 선택 권한은 거절해도 괜찮아요."
              : "Permissions are requested only when useful, and optional ones can be declined."
          }
        />

        <View style={styles.cards}>
          {ENTRIES.map((e) => {
            const tag = STATUS_LABEL[e.status];
            return (
              <View key={e.name.en} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text variant="body" style={styles.cardTitle}>
                    {e.name[locale]}
                  </Text>
                  <View style={[styles.tag, { borderColor: semantic[tag.color] }]}>
                    <Text variant="caption" color={tag.color}>
                      {tag[locale]}
                    </Text>
                  </View>
                </View>
                <Text variant="subtle" color="textMuted" style={{ lineHeight: 20 }}>
                  {e.why[locale]}
                </Text>
                <Text variant="subtle" color="textSubtle">
                  {locale === "ko" ? "플랫폼: " : "Platform: "}
                  {e.platform === "both" ? (locale === "ko" ? "웹 + 네이티브" : "Web + Native") : e.platform === "web" ? "Web" : e.platform === "native" ? "Native" : "N/A"}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.principles}>
          <Text variant="caption" color="brand" style={styles.principlesTitle}>
            {locale === "ko" ? "원칙" : "Principles"}
          </Text>
          {(locale === "ko"
            ? [
                "최소한만 요청: 새 기능마다 권한 영향을 먼저 검토.",
                "거절해도 앱은 동작: 권한은 모두 점진적, 선택적.",
                "탭할 때만: 클립보드 등 즉시 작업 외엔 백그라운드 접근 없음.",
                "왜 필요한지 명시: 모든 권한 요청에 짧은 설명.",
                "데이터는 당신 것: 각 계정은 본인 기록에만 접근하고, 언제든 내보낼 수 있음.",
              ]
            : [
                "Minimum surface: every new feature is reviewed for permission impact.",
                "Decline-friendly: the app works without any optional permission.",
                "Only on tap: no background access beyond on-tap actions like Copy.",
                "Explain the why: every prompt comes with a short reason.",
                "Your data, yours: each account can access only its own records; export anytime.",
              ]
          ).map((p, i) => (
            <Text key={i} variant="subtle" color="textMuted" style={styles.principle}>
              · {p}
            </Text>
          ))}
        </View>

        <View style={styles.actions}>
          <Link href="/manual" asChild>
            <Button label={locale === "ko" ? "사용 안내서로" : "Open the manual"} variant="secondary" />
          </Link>
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  cards: { gap: spacing.sm },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  cardTitle: { fontWeight: "600", flex: 1 },
  tag: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  principles: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  principlesTitle: { letterSpacing: 0 },
  principle: { lineHeight: 20 },
  actions: { gap: spacing.sm },
});
