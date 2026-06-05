import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, Share } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { buildPersona, type PersonaCard } from "@/lib/persona/build";
import { buildCenterCards } from "@/lib/persona/center";
import { TYPE_NICKNAME } from "@/lib/persona/mbti";
import { STYLE_LABEL, STYLE_DESCRIPTION } from "@/lib/persona/attachment";
import { labelFramework } from "@/lib/audit/frameworkLabels";
import type { Framework } from "@/lib/audit/questions";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";

export default function Persona() {
  const { i18n } = useTranslation();
  const { userId, loading, hasProfile, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [building, setBuilding] = useState(false);
  const { moment: companionMoment, fire: fireCompanion } = useCompanionMoment();
  // One build per resolved (userId, locale) — keyed so a relog or language
  // switch rebuilds, but the auth resolve window (hasProfile/isMinor flipping
  // from null) does not re-fire it.
  const builtKey = useRef<string | null>(null);

  useEffect(() => {
    // buildPersona() calls Gemini on mount and forwards `minor` for crisis
    // routing (C10). Wait for fully-resolved auth: while `loading` is true,
    // hasProfile/isMinor are still null, so building now would (a) treat a
    // minor as an adult on the crisis hotline and (b) re-fire once they
    // resolve — an extra Gemini call + duplicate personas upsert. Gate on the
    // settled state, and dedupe per (userId, locale) so it runs exactly once.
    if (loading || !userId || hasProfile !== true) return;
    const buildKey = `${userId}:${locale}`;
    if (builtKey.current === buildKey) return;
    builtKey.current = buildKey;
    function runBuild() {
      if (!userId) return;
      setBuilding(true);
      buildPersona(userId, locale, isMinor === true)
        .then((p) => {
          setPersona(p);
          // 아치 builds the connections once a persona card synthesizes (companion pack §3).
          if (p) fireCompanion("personaUpdated");
        })
        .catch((e) => {
          // Raw error stays in logs only; users see product-tone copy + retry.
          console.warn("[persona] build failed", (e as Error).message);
          Alert.alert(
            locale === "ko" ? "자기 모델을 만들지 못했어요" : "Couldn't build your self-model",
            locale === "ko"
              ? "조각을 모으는 중에 잠깐 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
              : "Something interrupted gathering your pieces. Please try again in a moment.",
            [
              { text: locale === "ko" ? "다시 시도" : "Try again", onPress: runBuild },
              {
                text: locale === "ko" ? "조각 담기로" : "Back to capture",
                style: "cancel",
                onPress: () => router.replace("/capture"),
              },
            ],
          );
        })
        .finally(() => setBuilding(false));
    }
    runBuild();
  }, [loading, userId, hasProfile, isMinor, locale, fireCompanion]);

  if (loading || building) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <ActivityIndicator color={semantic.brand} />
          <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.md }}>
            {locale === "ko" ? "당신을 이루는 조각들을 모으는 중이에요..." : "Gathering the pieces of you..."}
          </Text>
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (!persona) {
    const toolCards: { label: string; sub: string; route: "/audit" | "/big-five" | "/attachment" }[] =
      locale === "ko"
        ? [
            { label: "라이프 오딧", sub: "25문항 · 약 8분", route: "/audit" },
            { label: "Big Five (BFI-44)", sub: "44문항 · 약 8분", route: "/big-five" },
            { label: "애착 스타일 (ECR-S)", sub: "12문항 · 약 3분", route: "/attachment" },
          ]
        : [
            { label: "Life audit", sub: "25 items · ~8 min", route: "/audit" },
            { label: "Big Five (BFI-44)", sub: "44 items · ~8 min", route: "/big-five" },
            { label: "Attachment (ECR-S)", sub: "12 items · ~3 min", route: "/attachment" },
          ];
    return (
      <PremiumAppShell>
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          <SceneHero
            eyebrow={locale === "ko" ? "07. 나의 모습" : "07. Self model"}
            title={locale === "ko" ? "아직 모을 조각이 부족해요" : "Not enough pieces yet"}
            subtitle={
              locale === "ko"
                ? "도구 하나만 마쳐도 자기 모델 v1을 만들 수 있어요"
                : "Finish one tool and we can build self-model v1"
            }
            island={CORE_VILLAGE_UI.island}
            worker={CORE_VILLAGE_UI.worker}
            accent={CORE_VILLAGE_UI.accent}
            speech={
              locale === "ko"
                ? "검사 하나만 끝내도 윤곽이 생겨요. 같이 첫 조각부터 모아볼까요?"
                : "One assessment is enough to sketch the outline. Shall we gather the first piece?"
            }
            primaryAction={{
              label: locale === "ko" ? "라이프 오딧 시작" : "Start life audit",
              onPress: () => router.push("/audit"),
            }}          />
          <View style={styles.toolGrid}>
            {toolCards.map((t) => (
              <View key={t.route} style={styles.toolCard}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: "600" }}>{t.label}</Text>
                  <Text variant="subtle" color="textMuted" style={{ marginTop: 2 }}>{t.sub}</Text>
                </View>
                <Button
                  label={locale === "ko" ? "시작" : "Start"}
                  variant="secondary"
                  onPress={() => router.push(t.route)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </PremiumAppShell>
    );
  }

  async function handleExport() {
    if (!persona) return;
    try {
      await Share.share({ message: persona.markdownExport, title: "2nd-Brain Persona" });
    } catch (e) {
      // Raw error stays in logs only; users see product-tone copy + retry.
      console.warn("[persona] export failed", (e as Error).message);
      Alert.alert(
        locale === "ko" ? "내보내기를 마치지 못했어요" : "Couldn't finish the export",
        locale === "ko"
          ? "공유를 여는 중에 문제가 생겼어요. 다시 시도해 주세요."
          : "Something went wrong opening the share sheet. Please try again.",
        [
          { text: locale === "ko" ? "다시 시도" : "Try again", onPress: () => void handleExport() },
          { text: locale === "ko" ? "닫기" : "Dismiss", style: "cancel" },
        ],
      );
    }
  }

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "07. 나의 모습" : "07. Self model"}
          title={locale === "ko" ? "자기 모델이 하나로 모였어요" : "Your self-model is gathered"}
          subtitle={
            persona.traitsSource === "bfi"
              ? locale === "ko"
                ? "BFI-44 실측 · 애착 합성"
                : "BFI-44 measurement · attachment combined"
              : locale === "ko"
                ? "일기 기반 추정 · 평가하면 실측으로 업데이트"
                : "Journal-based estimate · assessments update it"
          }
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={
            locale === "ko"
              ? "반복해서 보이는 모습들을 모았어요. 중심 화면에서 방향으로 이어볼 수 있어요."
              : "I gathered the patterns that keep showing up. You can turn them into direction in Core."
          }
          primaryAction={{
            label: locale === "ko" ? "나의 중심 보기" : "Open core",
            onPress: () => router.push("/core-brain"),
          }}
          secondaryAction={{
            label: locale === "ko" ? "내보내기" : "Export",
            variant: "secondary",
            onPress: handleExport,
          }}        />

        {/* 나의 중심 — §7-2 three-card summary in Core Brain voice.
            Each card's meaning is coded by its left-border accent
            (mint / signal-blue / pixel-lamp), per DESIGN.md accent budget. */}
        <View style={styles.centerSection}>
          <Text variant="caption" color="textMuted" style={{ letterSpacing: 0 }}>
            {locale === "ko" ? "나의 중심" : "Center of me"}
          </Text>
          {buildCenterCards(persona, locale).map((card) => (
            <View key={card.id} style={[styles.centerCard, { borderLeftColor: card.accent }]}>
              <Text variant="caption" color="textMuted">{card.title}</Text>
              <Text variant="body" style={{ marginTop: 2 }}>{card.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.traitsCard}>
          {Object.entries(persona.traits).map(([k, v]) => {
            const label = TRAIT_LABELS[locale][k as keyof typeof TRAIT_LABELS["en"]] ?? k;
            const score = Math.round(v * 100);
            const aboveMean = v > 0.5;
            return (
              <View key={k} style={styles.traitRow}>
                <Text variant="body" style={{ width: 160 }}>{label}</Text>
                <View style={styles.barOuter}>
                  <View style={[styles.barInner, { width: `${v * 100}%` }]} />
                  {/* Midline reference at 50% so users can read above/below */}
                  <View style={styles.barMidline} />
                </View>
                <Text
                  variant="subtle"
                  color={aboveMean ? "brand" : "textMuted"}
                  style={{ width: 40, textAlign: "right", fontVariant: ["tabular-nums"] }}
                >
                  {score}
                </Text>
              </View>
            );
          })}
          <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.sm }}>
            {locale === "ko"
              ? "Big Five 근사치 (v1). 기록에서 보이는 패턴일 뿐, 판단이나 평가는 아니에요."
              : "Big Five proxy (v1). A pattern view from your records, not an evaluation."}
          </Text>
        </View>

        <View style={styles.narrativeCard}>
          <Text variant="caption" color="textMuted">
            {locale === "ko" ? "AI 요약" : "AI summary"}
          </Text>
          <Text variant="body" style={{ marginTop: spacing.xs }}>{persona.patterns.summary}</Text>
        </View>

        {Object.entries(persona.patterns).filter(([k]) => k.startsWith("top_")).length > 0 ? (
          <View style={styles.patternsCard}>
            <Text variant="caption" color="textMuted">
              {locale === "ko" ? "관찰된 패턴 (최근)" : "Observed patterns (recent)"}
            </Text>
            {Object.entries(persona.patterns)
              .filter(([k]) => k.startsWith("top_"))
              .map(([k, count]) => {
                const kind = k.replace(/^top_/, "");
                return (
                  <View key={k} style={styles.patternRow}>
                    <View style={styles.patternDot} />
                    <Text variant="body" style={{ flex: 1 }}>{kind}</Text>
                    <Text variant="subtle" color="textMuted">
                      {locale === "ko" ? `${count}회` : `${count}×`}
                    </Text>
                  </View>
                );
              })}
            <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
              {locale === "ko"
                ? "최근 기록에서 가장 자주 다룬 주제예요. 단정이 아닌 관찰입니다."
                : "Themes you've returned to most often in recent entries. Observation, not verdict."}
            </Text>
          </View>
        ) : null}

        {persona.mbti ? (
          <View style={styles.mbtiCard}>
            <Text variant="caption" color="textMuted">
              {locale === "ko" ? "MBTI 참고값" : "MBTI reference"}
            </Text>
            <View style={styles.mbtiRow}>
              <Text variant="heading" color="text" style={styles.mbtiType}>
                {persona.mbti.type}
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="body" style={{ fontWeight: "600" }}>
                  {TYPE_NICKNAME[locale][persona.mbti.type] ?? persona.mbti.type}
                </Text>
                <Text variant="subtle" color="textMuted" style={{ marginTop: 2 }}>
                  {locale === "ko"
                    ? "MBTI는 학술적 신뢰도가 낮은 분류입니다. 자기 인식의 출발점으로만 가볍게 보세요."
                    : "MBTI has weak scientific validity. Use as a self-awareness starting point only."}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {persona.attachment ? (
          <View style={styles.attachmentCard}>
            <Text variant="caption" color="textMuted">
              {locale === "ko" ? "애착 스타일 (ECR-S)" : "Attachment style (ECR-S)"}
            </Text>
            <Text variant="body" style={{ marginTop: spacing.xs, fontWeight: "600" }}>
              {STYLE_LABEL[locale][persona.attachment.style]}
            </Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
              {STYLE_DESCRIPTION[locale][persona.attachment.style]}
            </Text>
            <View style={styles.attachmentDims}>
              <AttachmentDimBar
                label={locale === "ko" ? "불안" : "Anxiety"}
                value={persona.attachment.anxiety}
              />
              <AttachmentDimBar
                label={locale === "ko" ? "회피" : "Avoidance"}
                value={persona.attachment.avoidance}
              />
            </View>
          </View>
        ) : null}

        {persona.values.length > 0 ? (
          <View style={styles.valuesCard}>
            <Text variant="caption" color="textMuted">
              {locale === "ko" ? "관련 프레임워크" : "Relevant frameworks"}
            </Text>
            <Text variant="body" style={{ marginTop: spacing.xs }}>
              {persona.values.map((f) => labelFramework(f as Framework, locale)).join(" · ")}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={locale === "ko" ? "Markdown으로 내보내기" : "Export as Markdown"}
            variant="primary"
            onPress={handleExport}
          />
          <Button
            label={locale === "ko" ? "Big Five 다시 평가" : "Retake Big Five"}
            variant="secondary"
            onPress={() => router.replace("/big-five")}
          />
          <Button
            label={locale === "ko" ? "애착 스타일 평가" : "Attachment style test"}
            variant="secondary"
            onPress={() => router.replace("/attachment")}
          />
          <Button
            label={locale === "ko" ? "조각 담기로 돌아가기" : "Back to capture"}
            variant="secondary"
            onPress={() => router.replace("/capture")}
          />
        </View>
      </ScrollView>
      {/* 아치 appears briefly when the persona model rebuilds (companion pack §3) */}
      {companionMoment ? (
        <CompanionMoment moment={companionMoment} style={styles.companionFlash} />
      ) : null}
    </PremiumAppShell>
  );
}

// ECR-S anxiety/avoidance values are on a 1-7 Likert scale. Mid-point (4) is
// the median-split threshold the scorer uses to classify style.
function AttachmentDimBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, (value - 1) / 6));
  const high = value > 4;
  return (
    <View style={styles.dimRow}>
      <Text variant="subtle" color="textMuted" style={{ width: 56 }}>{label}</Text>
      <View style={styles.dimBarOuter}>
        <View style={[styles.dimBarInner, { width: `${pct * 100}%` }]} />
        <View style={styles.dimBarMid} />
      </View>
      <Text
        variant="subtle"
        color={high ? "brand" : "textMuted"}
        style={{ width: 36, textAlign: "right", fontVariant: ["tabular-nums"] }}
      >
        {value.toFixed(1)}
      </Text>
    </View>
  );
}

// Big Five trait labels translated for the persona card. Keys match
// the PersonaTraits TypeScript shape from lib/persona/build.ts.
const TRAIT_LABELS: Record<"en" | "ko", Record<"openness" | "conscientiousness" | "extraversion" | "agreeableness" | "neuroticism", string>> = {
  en: {
    openness: "Openness",
    conscientiousness: "Conscientiousness",
    extraversion: "Extraversion",
    agreeableness: "Agreeableness",
    neuroticism: "Neuroticism",
  },
  ko: {
    openness: "개방성",
    conscientiousness: "성실성",
    extraversion: "외향성",
    agreeableness: "친화성",
    neuroticism: "신경성",
  },
};

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  centerSection: { gap: spacing.sm },
  centerCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  traitsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  traitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barOuter: {
    flex: 1,
    height: 8,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    overflow: "hidden",
    position: "relative",
  },
  barInner: { height: "100%", backgroundColor: semantic.brand },
  barMidline: {
    position: "absolute",
    left: "50%",
    top: -2,
    bottom: -2,
    width: 1,
    backgroundColor: semantic.textSubtle,
    opacity: 0.35,
  },
  narrativeCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  valuesCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  patternsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  patternRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 },
  patternDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
  actions: { gap: spacing.md, marginTop: spacing.md },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  emptyScroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  emptyHeader: { alignItems: "center", marginTop: spacing.xl },
  toolGrid: { gap: spacing.sm, marginTop: spacing.md },
  toolCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  mbtiCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  mbtiRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  mbtiType: { fontVariant: ["tabular-nums"], letterSpacing: 0 },
  attachmentCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  attachmentDims: { marginTop: spacing.md, gap: spacing.xs },
  dimRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dimBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radii.sm,
    overflow: "hidden",
    position: "relative",
  },
  dimBarInner: { height: "100%", backgroundColor: semantic.brand },
  dimBarMid: {
    position: "absolute",
    left: "50%",
    top: -2,
    bottom: -2,
    width: 1,
    backgroundColor: semantic.textSubtle,
    opacity: 0.35,
  },
});
