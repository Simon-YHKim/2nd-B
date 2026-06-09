// User manual + getting-started guide. Per master blueprint section
// 14 (design tokens) the tone is "warm but serious"; this screen is
// the long-form companion to coachmarks shown on first visit.
//
// Reachable from the /capture navRow and auto-shown right after sign-up
// (handled by AuthContext via users.coachmarks_seen).

import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Link } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

interface ManualSection {
  emoji: string; // semantic anchor only — kept ASCII-art-ish for the design
  title: { en: string; ko: string };
  body: { en: string; ko: string };
}

const SECTIONS: ManualSection[] = [
  {
    emoji: "01",
    title: {
      en: "What 2nd-Brain is",
      ko: "두번째 뇌란",
    },
    body: {
      en: "A second brain built from what you write and save. Daily journaling, past-me interviews, and saved sources build a personal knowledge map you own. Export your notes anytime as a portable bundle.",
      ko: "당신이 쓰고 저장한 것들로 만드는 두번째 뇌예요. 매일의 일기, 과거의 나 인터뷰, 저장한 자료가 모여 당신만의 지식 지도가 됩니다. 언제든 하나의 묶음으로 내보낼 수 있어요.",
    },
  },
  {
    emoji: "02",
    title: {
      en: "Daily loop",
      ko: "하루 루틴",
    },
    body: {
      en: "Write a journal entry, tag it with a topic, then optionally ask SecondB for a reflection. Over weeks, recurring themes surface as observations, never verdicts.",
      ko: "오늘 일기를 쓰고, 주제와 태그를 달고, 원하면 세컨비의 되묻기를 받아요. 몇 주가 쌓이면 반복되는 주제가 단정이 아닌 관찰로 떠오릅니다.",
    },
  },
  {
    emoji: "03",
    title: {
      en: "Capture anything",
      ko: "무엇이든 캡처",
    },
    body: {
      en: "Paste an article, video transcript, paper, or discussion thread. The capture screen recognizes the kind. Your inbox lists everything; tap 'Summary + questions' to get a reflection prompt.",
      ko: "글, 영상 자막, 논문, 대화 스레드를 붙여 넣을 수 있어요. 캡처 화면에서 종류를 알아봅니다. 받은편지함에 다 모이고, '요약과 질문' 탭으로 성찰 질문을 받을 수 있어요.",
    },
  },
  {
    emoji: "04",
    title: {
      en: "Wiki graph",
      ko: "위키 그래프",
    },
    body: {
      en: "Generate a wiki page from any saved item. When one page mentions another by name, they connect automatically. Tap a tag to filter, tap a page to expand body and related references, and use the graph to see the whole network.",
      ko: "받은편지함에서 '위키 페이지 생성'을 누르면 저장한 자료가 위키 페이지가 됩니다. 한 페이지가 다른 페이지 이름을 언급하면 자동으로 서로 연결돼요. 태그를 탭하면 필터, 페이지를 탭하면 본문과 관련 참조가 펼쳐지고, 그래프에서 전체 연결을 볼 수 있습니다.",
    },
  },
  {
    emoji: "05",
    title: {
      en: "SecondB (chat)",
      ko: "세컨비 (채팅)",
    },
    body: {
      en: "SecondB is a chat that answers from your saved records and wiki pages. Ask 'what patterns show up across my captures this month?' Replies point back to your own pages by name. Daily limit depends on your plan; resets at midnight KST.",
      ko: "세컨비는 당신이 저장한 기록과 위키 페이지를 바탕으로 답하는 채팅이에요. '이번 달 캡처에서 반복되는 패턴은?' 같은 질문에, 답이 당신의 페이지 이름을 근거로 함께 보여줍니다. 일일 한도는 이용 플랜별로 다르고, KST 자정에 리셋됩니다.",
    },
  },
  {
    emoji: "06",
    title: {
      en: "Safety first",
      ko: "안전 우선",
    },
    body: {
      en: "Before the app replies, it checks whether your message may need urgent support. Crisis signals show help resources first, including KR 109 and US 988. Safety-related interactions are recorded for review.",
      ko: "앱이 답하기 전에, 메시지에 긴급한 도움이 필요한 신호가 있는지 먼저 확인합니다. 위기 신호가 보이면 한국 109 / 미국 988 등 도움받을 연락처를 먼저 안내해요. 안전 관련 상호작용은 검토를 위해 기록됩니다.",
    },
  },
  {
    emoji: "07",
    title: {
      en: "Privacy + portability",
      ko: "프라이버시 + 휴대성",
    },
    body: {
      en: "Your data is yours. Each account can access only its own records, so no one else can see your wiki. Export at any time as one portable text bundle you can keep or paste elsewhere. No lock-in.",
      ko: "데이터는 당신 것이에요. 각 계정은 본인 기록에만 접근할 수 있어 다른 누구도 당신의 위키를 보지 못합니다. 언제든 하나의 텍스트 묶음으로 내보내 보관하거나 다른 곳에 붙여 넣을 수 있어요. 락인 없음.",
    },
  },
  {
    emoji: "08",
    title: {
      en: "Research-grounded self-understanding",
      ko: "연구 기반 자기 이해",
    },
    body: {
      en: "2nd-Brain grounds explanations and recommendations in established psychology research on traits, motivation, attachment, life stages, and strengths. It does not treat personality labels or astrology as proof. Research citations stay available in the library.",
      ko: "2nd-Brain의 설명과 추천은 성격 특성, 동기, 애착, 생애 단계, 강점에 관한 검증된 심리학 연구를 기준으로 합니다. 성격 유형 이름이나 점성술을 근거처럼 쓰지 않습니다. 참고한 연구 자료는 리서치 화면에서 확인할 수 있어요.",
    },
  },
];

export default function Manual() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "안내서를 불러오는 중이에요…" : "Loading manual…"} />
        </View>
      </PremiumAppShell>
    );
  }

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.languageRow}>
          <Text variant="caption" color="brand">2nd-Brain Guide</Text>
          <Pressable
            onPress={() => {
              void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
            }}
            hitSlop={6}
            style={styles.languagePill}
            accessibilityRole="button"
            accessibilityLabel={
              locale === "ko" ? "Manual language: switch to English" : "Manual language: switch to Korean"
            }
          >
            <Text variant="caption" color="brand">
              {locale === "ko" ? "EN" : "한국어"}
            </Text>
          </Pressable>
        </View>

        <SceneHero
          eyebrow={locale === "ko" ? "안내서" : "Manual"}
          title={locale === "ko" ? "내 중심을 읽는 짧은 지도" : "A compact map of your core"}
          subtitle={locale === "ko" ? "루틴 · 캡처 · 위키 · 안전" : "Routine · capture · wiki · safety"}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={
            locale === "ko"
              ? "처음이라면 위에서부터 읽고, 익숙해지면 필요한 카드만 펼쳐보세요."
              : "Read top-down the first time; later, jump to the card you need."
          }
        />

        <View style={styles.cards}>
          {SECTIONS.map((s) => (
            <View key={s.emoji} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text variant="caption" color="brand" style={styles.cardEyebrow}>
                  {s.emoji}
                </Text>
                <Text variant="body" style={styles.cardTitle}>
                  {s.title[locale]}
                </Text>
              </View>
              <Text variant="body" color="textMuted" style={styles.cardBody}>
                {s.body[locale]}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.glossary}>
          <Text variant="caption" color="textMuted" style={styles.glossaryTitle}>
            {locale === "ko" ? "용어 한 줄 정리" : "One-line glossary"}
          </Text>
          {(locale === "ko"
            ? [
                ["캡처 (Capture)", "원본 자료를 받은편지함에 모으는 동작"],
                ["인박스 (Inbox)", "캡처한 모든 자료의 목록"],
                ["위키 페이지 (Wiki Page)", "캡처한 자료를 발전시킨 지식 항목"],
                ["요약과 질문", "앱이 자료를 요약하고 4개의 성찰 질문을 만드는 단계"],
                ["위키로 만들기", "자료를 위키 페이지로 발전시키고 관련 페이지를 자동으로 연결하는 단계"],
                ["내보내기", "전체 위키를 한 번에 보관 가능한 텍스트 묶음으로 추출"],
                ["세컨비", "당신이 저장한 기록과 위키를 바탕으로 답하는 채팅"],
                ["안전 안내", "위기 신호가 보이면 답변보다 도움받을 연락처를 먼저 안내"],
              ]
            : [
                ["Capture", "Adding raw content to your inbox"],
                ["Inbox", "List of every captured source"],
                ["Wiki page", "A developed knowledge page from a saved note, person, or idea"],
                ["Summary + questions", "The app summarizes saved material and suggests 4 reflection questions"],
                ["Build wiki pages", "Turn saved material into wiki pages and connect related pages automatically"],
                ["Export", "Pack the whole wiki into a portable text bundle you can keep or reuse"],
                ["SecondB", "A chat that answers from your saved records and wiki pages"],
                ["Safety check", "If a crisis signal appears, the app shows help resources before any reply"],
              ]).map(([term, def]) => (
            <View key={term} style={styles.glossaryRow}>
              <Text variant="caption" color="text" style={styles.glossaryTerm}>
                {term}
              </Text>
              <Text variant="subtle" color="textMuted" style={styles.glossaryDef}>
                {def}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.recentList}>
          <Text variant="caption" color="textMuted" style={styles.glossaryTitle}>
            {locale === "ko" ? "최근 추가된 기능" : "Recently added"}
          </Text>
          {(locale === "ko"
            ? [
                "성격 특성과 애착 스타일: 짧게 남기는 자기 이해 평가",
                "인사이트 화면: 매주 활동·자주 다룬 주제·결론 모음",
                "리서치 화면: 세컨비가 인용하는 학술 자료 브라우저",
                "오늘의 성찰 질문 + 연속 기록 카운터",
                "기록 · 캡처 · 위키 페이지 삭제 가능",
                "캡처 시 종류 자동 감지 + 미리보기",
              ]
            : [
                "Personality and attachment: short self-knowledge assessments",
                "Insights screen: weekly activity, recurring topics, conclusion stream",
                "Research screen: browse validated academic sources SecondB cites",
                "Daily reflection prompt + streak counter",
                "Delete records, captures, and wiki pages",
                "Auto-detect kind on capture + preview before save",
              ]).map((line, i) => (
            <Text key={i} variant="subtle" color="textMuted" style={styles.recentLine}>
              · {line}
            </Text>
          ))}
        </View>

        <View style={styles.actions}>
          {userId ? (
            <Link href="/capture" asChild>
              <Button
                label={locale === "ko" ? "오늘의 조각 남기기" : "Leave today's piece"}
                variant="primary"
                accessibilityHint={
                  locale === "ko" ? "캡처 화면을 열어 오늘의 조각을 저장합니다." : "Opens capture to save today's piece."
                }
              />
            </Link>
          ) : (
            <Link href="/sign-up" asChild>
              <Button
                label={locale === "ko" ? "시작하기" : "Get started"}
                variant="primary"
                accessibilityHint={locale === "ko" ? "회원가입 화면을 엽니다." : "Opens the sign-up screen."}
              />
            </Link>
          )}
          <Link href="/permissions" asChild>
            <Button
              label={locale === "ko" ? "권한 사용 안내" : "What the app accesses"}
              variant="secondary"
              accessibilityHint={
                locale === "ko" ? "앱이 사용하는 권한 안내 화면을 엽니다." : "Opens the app permissions guide."
              }
            />
          </Link>
          <Link href="/research" asChild>
            <Button
              label={locale === "ko" ? "큐레이션된 자료" : "Curated research"}
              variant="secondary"
              accessibilityHint={
                locale === "ko"
                  ? "로그인 후 검증된 연구 자료 목록을 엽니다."
                  : "Opens the curated research library. Sign-in required."
              }
            />
          </Link>
        </View>

        <Text variant="subtle" color="textSubtle" style={styles.versionFootnote}>
          {locale === "ko"
            ? "두번째 뇌 · XPRIZE Build with Gemini · Education & Human Potential"
            : "2nd-Brain · XPRIZE Build with Gemini · Education & Human Potential"}
        </Text>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  languageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  languagePill: {
    borderWidth: 1,
    borderColor: semantic.brand,
    borderRadius: radii.sm,
    backgroundColor: semantic.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
  },
  cards: { gap: spacing.sm },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartColor: semantic.brand,
    borderStartWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    shadowColor: semantic.brand,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardEyebrow: { letterSpacing: 0, flexShrink: 0 },
  cardTitle: { fontFamily: fontFamilies.pixelKo, fontWeight: "600", flex: 1, minWidth: 0 },
  cardBody: { lineHeight: 22 },
  glossary: { backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  glossaryTitle: { letterSpacing: 0, marginBottom: spacing.xs },
  glossaryRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 2 },
  glossaryTerm: { width: 140 },
  glossaryDef: { flex: 1, lineHeight: 18 },
  actions: { gap: spacing.sm },
  recentList: {
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  recentLine: { lineHeight: 20 },
  versionFootnote: { textAlign: "center", marginTop: spacing.lg, letterSpacing: 0 },
});
