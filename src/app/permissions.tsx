// Permissions transparency screen. Surfaces exactly what device
// capabilities the app uses, what's planned, and what's optional.
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
      en: "Required for Supabase (auth, data) and Gemini calls. Standard HTTPS.",
      ko: "Supabase(인증·데이터)와 Gemini 호출에 필요. 표준 HTTPS.",
    },
  },
  {
    name: { en: "Notifications", ko: "알림" },
    status: "optional",
    platform: "both",
    why: {
      en: "One-tap 'send me today's prompt' on Web. Native push (daily reminder) ships with EAS Build.",
      ko: "웹에서 '오늘의 질문 받기' 기능. 네이티브 푸시(매일 리마인더)는 EAS Build 단계에서 추가.",
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
      en: "Planner Engine (v2) will offer optional calendar reminders for the daily reflection. Read/write only when explicitly granted.",
      ko: "플래너 엔진(v2)에서 매일 성찰의 캘린더 리마인더(선택). 명시적 허락 후에만 읽기/쓰기.",
    },
  },
  {
    name: { en: "Camera / Microphone", ko: "카메라 / 마이크" },
    status: "not_used",
    platform: "none",
    why: {
      en: "Not requested. No photo or voice capture in scope.",
      ko: "요청하지 않습니다. 사진·음성 캡처는 범위 밖.",
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
  planned: { en: "Planned (v2)", ko: "계획 (v2)", color: "warning" },
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
          subtitle={locale === "ko" ? "네트워크 · 알림 · 클립보드" : "Network · notifications · clipboard"}
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
                "데이터는 당신 것: RLS로 어카운트당 격리, 언제든 익스포트 가능.",
              ]
            : [
                "Minimum surface: every new feature is reviewed for permission impact.",
                "Decline-friendly: the app works without any optional permission.",
                "Only on tap: no background access beyond on-tap actions like Copy.",
                "Explain the why: every prompt comes with a short reason.",
                "Your data, yours: RLS isolates per account; export anytime.",
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
