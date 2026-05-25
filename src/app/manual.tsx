// User manual + getting-started guide. Per master blueprint section
// 14 (design tokens) the tone is "warm but serious"; this screen is
// the long-form companion to coachmarks shown on first visit.
//
// Reachable from /journal navRow and auto-shown right after sign-up
// (handled by AuthContext via users.coachmarks_seen).

import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

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
      en: "An AI that learns you. Daily journaling + life-audit interviews + clipper imports build a personal knowledge graph you OWN. Export to Claude / ChatGPT anytime — your second brain travels.",
      ko: "당신을 배우는 AI예요. 매일의 일기 + 라이프 오딧 인터뷰 + 클리퍼 자료 캡처가 모여 당신만의 지식 그래프가 됩니다. Claude·ChatGPT로 언제든 내보낼 수 있어 — 두번째 뇌는 함께 이동합니다.",
    },
  },
  {
    emoji: "02",
    title: {
      en: "Daily loop",
      ko: "하루 루틴",
    },
    body: {
      en: "Write a journal entry → tag it with a topic + tags → optional reflection from the Advisor. Over weeks, patterns surface (Big Five proxies, attachment cues, values) as observations, never verdicts.",
      ko: "오늘 일기를 쓰고 → 주제와 태그를 달고 → 원하면 어드바이저의 되묻기를 받아요. 몇 주가 쌓이면 패턴(Big Five 근사, 애착 단서, 가치)이 단정이 아닌 관찰로 떠오릅니다.",
    },
  },
  {
    emoji: "03",
    title: {
      en: "Capture anything",
      ko: "무엇이든 캡처",
    },
    body: {
      en: "Paste an Obsidian-clipped article, a YouTube transcript, a paper, a Reddit thread — /capture auto-detects the kind. Your inbox lists everything; tap '→ Summarize + 4 questions' to ask Gemini for a reflection prompt.",
      ko: "Obsidian 클리퍼로 캡처한 글, 유튜브 자막, 논문, 레딧 스레드 — /캡처에서 종류를 자동 인식해요. 받은편지함에 다 모이고, '→ 요약 + 4질문' 탭으로 Gemini의 성찰 질문을 받을 수 있어요.",
    },
  },
  {
    emoji: "04",
    title: {
      en: "Wiki graph",
      ko: "위키 그래프",
    },
    body: {
      en: "Generate a wiki page from any source. Pages link to each other via [[wikilinks]] — tap a tag to filter, tap a page to expand body + backlinks. The graph view (coming next) will visualize the whole network.",
      ko: "받은편지함에서 '→ 위키 페이지 생성'을 누르면 소스가 위키 페이지가 됩니다. [[위키링크]]로 페이지들이 서로 연결돼요 — 태그를 탭하면 필터, 페이지를 탭하면 본문+백링크가 펼쳐집니다. 그래프 뷰는 다음 단계에 추가됩니다.",
    },
  },
  {
    emoji: "05",
    title: {
      en: "Jarvis (chat)",
      ko: "자비스 (채팅)",
    },
    body: {
      en: "/jarvis is a chat that has your wiki as system context. Ask 'what patterns show up across my captures this month?' — replies cite [[slugs]] from your own pages. Daily limit per tier; resets at midnight KST.",
      ko: "/자비스는 당신의 위키를 시스템 컨텍스트로 가진 채팅이에요. '이번 달 캡처에서 반복되는 패턴은?' 같은 질문에, 답이 당신의 [[페이지 슬러그]]를 인용합니다. 일일 한도는 등급별, KST 자정 리셋.",
    },
  },
  {
    emoji: "06",
    title: {
      en: "Safety first",
      ko: "안전 우선",
    },
    body: {
      en: "Every AI call passes a 3-zone safety classifier BEFORE generation. Red-zone input never reaches the LLM — you get hotline guidance (KR 1393, US 988) instead. Audit log is mandatory for every call.",
      ko: "모든 AI 호출은 생성 전에 3존 안전 분류기를 통과해요. 위기 신호(레드존)는 LLM에 닿지 않고 한국 1393 / 미국 988 등 핫라인 안내로 라우팅됩니다. 모든 호출은 감사 로그에 남아요.",
    },
  },
  {
    emoji: "07",
    title: {
      en: "Privacy + portability",
      ko: "프라이버시 + 휴대성",
    },
    body: {
      en: "Your data is yours. RLS scopes every read/write to your auth.uid() — no one else can see your wiki. Export at any time as a single markdown bundle you can paste into any LLM. No lock-in.",
      ko: "데이터는 당신 것이에요. RLS가 모든 읽기/쓰기를 auth.uid()로 격리 — 다른 누구도 당신의 위키를 보지 못합니다. 언제든 단일 마크다운 번들로 내보내 어떤 LLM에도 붙일 수 있어요. 락인 없음.",
    },
  },
  {
    emoji: "08",
    title: {
      en: "Validated psychology",
      ko: "검증된 심리학",
    },
    body: {
      en: "We only cite Big Five, Self-Determination Theory, Attachment Theory, CBT, Erikson, VIA strengths. No MBTI, no astrology, no AI-invented frameworks. Every reference carries a DOI/URL.",
      ko: "Big Five · 자기결정성 이론 · 애착이론 · CBT · 에릭슨 · VIA 성격 강점 — 검증된 학술 프레임만 인용해요. MBTI, 점성술, AI가 만든 프레임은 사용하지 않아요. 모든 참고문헌에 DOI/URL이 있습니다.",
    },
  },
];

export default function Manual() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  if (loading) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="caption" color="brand">
            2nd-Brain
          </Text>
          <Text variant="heading" style={styles.title}>
            {locale === "ko" ? "사용 안내서" : "User manual"}
          </Text>
          <Text variant="body" color="textMuted">
            {locale === "ko"
              ? "8개 카드로 보는 두번째 뇌. 처음이라면 위에서부터, 익숙해진 뒤엔 필요할 때 다시 펼치세요."
              : "Eight cards. First time? Read top-down. Returning? Jump to what you need."}
          </Text>
        </View>

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
                ["인박스 (Inbox)", "캡처한 모든 소스의 목록"],
                ["위키 페이지 (Wiki Page)", "캡처를 발전시킨 지식 항목 (소스/엔티티/개념)"],
                ["Phase 1", "LLM이 소스를 요약하고 4개의 성찰 질문을 만드는 단계"],
                ["Phase 2", "소스를 위키 페이지로 승격하고 [[wikilink]] 연결을 만드는 단계"],
                ["익스포트", "전체 위키를 한 번에 마크다운 번들로 추출 (Claude/ChatGPT에 붙여넣기용)"],
                ["자비스", "당신의 위키를 시스템 컨텍스트로 가진 RAG 챗봇"],
                ["3존 분류기", "Green/Yellow/Red 안전 라우팅 (Red는 LLM 차단 + 핫라인)"],
              ]
            : [
                ["Capture", "Adding raw content to your inbox"],
                ["Inbox", "List of every captured source"],
                ["Wiki page", "A developed knowledge node (source/entity/concept)"],
                ["Phase 1", "LLM summarizes the source + emits 4 reflection questions"],
                ["Phase 2", "Promote a source into a wiki page and build [[wikilink]] edges"],
                ["Export", "Pack the whole wiki into a markdown bundle (paste into Claude/ChatGPT)"],
                ["Jarvis", "A RAG chatbot with your wiki as system context"],
                ["3-zone classifier", "Green/Yellow/Red safety routing (Red blocks the LLM + hotline)"],
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
                "Big Five (TIPI) · 애착 스타일 (ECR-S) — 검증된 3분 평가",
                "/insights — 매주 활동·자주 다룬 주제·결론 모음",
                "/research — 어드바이저가 인용하는 학술 자료 브라우저",
                "오늘의 성찰 질문 + 연속 기록 카운터",
                "기록 · 캡처 · 위키 페이지 삭제 가능",
                "캡처 시 종류 자동 감지 + 미리보기",
              ]
            : [
                "Big Five (TIPI) + Attachment (ECR-S) 3-min validated tests",
                "/insights — weekly activity, recurring topics, conclusion stream",
                "/research — browse validated academic sources the Advisor cites",
                "Daily reflection prompt + streak counter",
                "Delete affordances for records, captures, wiki pages",
                "Auto-detect kind on capture + preview before save",
              ]).map((line, i) => (
            <Text key={i} variant="subtle" color="textMuted" style={styles.recentLine}>
              · {line}
            </Text>
          ))}
        </View>

        <View style={styles.actions}>
          {userId ? (
            <Link href="/journal" asChild>
              <Button label={locale === "ko" ? "저널로 이동" : "Go to journal"} variant="primary" />
            </Link>
          ) : (
            <Link href="/sign-up" asChild>
              <Button label={locale === "ko" ? "시작하기" : "Get started"} variant="primary" />
            </Link>
          )}
          <Link href="/permissions" asChild>
            <Button label={locale === "ko" ? "권한 사용 안내" : "What the app accesses"} variant="secondary" />
          </Link>
          <Link href="/research" asChild>
            <Button label={locale === "ko" ? "큐레이션된 자료" : "Curated research"} variant="secondary" />
          </Link>
          {userId ? (
            <>
              <Link href="/insights" asChild>
                <Button label={locale === "ko" ? "내 인사이트" : "My insights"} variant="secondary" />
              </Link>
              <Link href="/big-five" asChild>
                <Button label={locale === "ko" ? "Big Five 평가" : "Big Five test"} variant="secondary" />
              </Link>
              <Link href="/attachment" asChild>
                <Button label={locale === "ko" ? "애착 스타일 평가" : "Attachment test"} variant="secondary" />
              </Link>
            </>
          ) : null}
          <Button label={locale === "ko" ? "뒤로" : "Back"} variant="secondary" onPress={() => router.back()} />
        </View>

        <Text variant="subtle" color="textSubtle" style={styles.versionFootnote}>
          {locale === "ko"
            ? "두번째 뇌 · XPRIZE Build with Gemini · Education & Human Potential"
            : "2nd-Brain · XPRIZE Build with Gemini · Education & Human Potential"}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { marginTop: spacing.xs },
  cards: { gap: spacing.sm },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftColor: semantic.brand,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardEyebrow: { letterSpacing: 1 },
  cardTitle: { fontWeight: "600" },
  cardBody: { lineHeight: 22 },
  glossary: { backgroundColor: semantic.surfaceAlt, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  glossaryTitle: { letterSpacing: 1, marginBottom: spacing.xs },
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
  versionFootnote: { textAlign: "center", marginTop: spacing.lg, letterSpacing: 0.5 },
});
