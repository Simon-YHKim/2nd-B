// Divergent workshop. SecondB unfolds a rough idea into a structured result:
// one worldline, scenes, objects, characters, and one next step.
//
// Generation goes through callGemini (purpose "imagine"), so C1/C3/C9 hold;
// the result is parsed into cards by parseImagineResult (never shown as raw
// chat text — pack §5). Save routes through captureFromMarkdown so the
// piece enters the knowledge layer / graph.

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, TextInput, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { IslandArt, ShardArt } from "@/components/art/IslandArt";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { ContextPill } from "@/components/premium";
import { callGemini } from "@/lib/llm/gemini";
import { VILLAGE_UI } from "@/lib/village-ui";
import {
  IMAGINE_SYSTEM,
  parseImagineResult,
  renderImagineMarkdown,
  type ParsedImagine,
} from "@/lib/llm/imagine";
import { captureFromMarkdown } from "@/lib/wiki/capture";

type Phase = "input" | "generating" | "result" | "saved";

export default function Imagine() {
  const { i18n } = useTranslation();
  const { userId, loading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const params = useLocalSearchParams<{ fromNode?: string }>();
  const fromNode = typeof params.fromNode === "string" && params.fromNode.length > 0 ? params.fromNode : null;

  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<ParsedImagine | null>(null);
  const [saving, setSaving] = useState(false);
  const companion = useCompanionMoment();
  const hasResult = (phase === "result" || phase === "saved") && result !== null;

  // Seed the prompt once from a graph-node entry (pack §7).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (fromNode && !seeded) {
      setSeeded(true);
      setDraft(locale === "ko" ? `'${fromNode}'에서 떠오른 장면: ` : `A scene from '${fromNode}': `);
    }
  }, [fromNode, seeded, locale]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  async function handleGenerate() {
    if (!userId || draft.trim().length === 0 || phase === "generating") return;
    setPhase("generating");
    // SecondB sparks as the idea starts unfolding.
    companion.fire("imagineStarted");
    try {
      const system = fromNode
        ? `${IMAGINE_SYSTEM}\nThe user started from the graph node "${fromNode}"; gently let that color the scenes.`
        : IMAGINE_SYSTEM;
      const reply = await callGemini({ userId, locale, purpose: "imagine", system, user: draft.trim(), minor: isMinor === true });
      setResult(parseImagineResult(reply.text));
      setPhase("result");
    } catch (e) {
      Alert.alert(
        locale === "ko" ? "펼치기 실패" : "Couldn't unfold",
        locale === "ko" ? "잠시 후 다시 시도해 주세요." : "Please try again in a moment.",
      );
      if (typeof console !== "undefined") console.warn("[imagine] generate failed", (e as Error).message);
      setPhase("input");
    }
  }

  async function handleSave() {
    if (!userId || !result) return;
    setSaving(true);
    try {
      await captureFromMarkdown({
        userId,
        rawMd: renderImagineMarkdown(result, locale),
        fallbackUrl: null,
        kindOverride: null,
        userTags: ["imagine"],
        track: "daily",
      });
      setPhase("saved");
      // SecondB tucks the scene into the village.
      companion.fire("imagineSaved");
    } catch (e) {
      Alert.alert(locale === "ko" ? "저장 실패" : "Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setDraft("");
    setPhase("input");
  }

  function developFurther() {
    if (!result) {
      reset();
      return;
    }
    setDraft([result.title, result.worldline, result.nextStep].filter(Boolean).join("\n\n"));
    setResult(null);
    setPhase("input");
  }

  const heroSpeech =
    phase === "saved"
      ? locale === "ko"
        ? "마을에 잘 보관했어요. 다음 장면도 이어볼까요?"
        : "It's tucked into the village. Want to keep building?"
      : hasResult
        ? locale === "ko"
          ? "멋진 생각이에요! 이 장면을 저장할까요?"
          : "Lovely thought. Should we save this scene?"
        : phase === "generating"
          ? locale === "ko"
            ? "떠오른 생각을 밤빛 장면으로 엮는 중이에요."
            : "I'm weaving that thought into a night-lit scene."
          : locale === "ko"
            ? "작은 생각을 던져보세요. 제가 장면으로 펼쳐볼게요."
            : "Toss me a small thought. I'll unfold it into a scene.";

  const primaryActionLabel =
    phase === "saved"
      ? locale === "ko" ? "지식 창고 열기" : "Open wiki"
      : hasResult
        ? locale === "ko" ? "마을에 저장" : "Save to village"
        : phase === "generating"
          ? locale === "ko" ? "상상하는 중..." : "Imagining..."
          : locale === "ko" ? "Divergent로 펼치기" : "Open Divergent";

  const secondaryActionLabel =
    hasResult
      ? locale === "ko" ? "더 발전시키기" : "Develop further"
      : locale === "ko" ? "입력 정리" : "Clear";

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={locale === "ko" ? "03. Divergent workshop" : "03. Divergent workshop"}
          title={locale === "ko" ? "세컨비와 낯선 경로 보기" : "Find an unexpected route with SecondB"}
          subtitle={locale === "ko" ? "SecondB · Divergent mode" : "SecondB · Divergent mode"}
          island={VILLAGE_UI.imagine.island}
          worker={VILLAGE_UI.imagine.worker}
          accent={VILLAGE_UI.imagine.accent}
          speech={heroSpeech}
          primaryAction={{
            label: primaryActionLabel,
            variant: "primary",
            loading: phase === "generating" || saving,
            disabled: phase === "generating" || saving || (!hasResult && draft.trim().length === 0),
            onPress: phase === "saved" ? () => router.push("/wiki") : hasResult ? handleSave : handleGenerate,
          }}
          secondaryAction={
            hasResult || draft.trim().length > 0
              ? {
                  label: secondaryActionLabel,
                  variant: "secondary",
                  disabled: phase === "generating",
                  onPress: hasResult ? developFurther : reset,
                }
              : undefined
          }
        />

        {/* Graph-node entry context. */}
        {fromNode ? (
          <View style={styles.contextPillWrap}>
            <ContextPill label={fromNode} />
          </View>
        ) : null}

        {/* Input panel — hidden once a result is showing */}
        {phase === "input" || phase === "generating" ? (
          <View style={styles.promptCard}>
            <Text variant="caption" color="brand" style={styles.panelTitle}>
              {locale === "ko" ? "생각을 던져보세요..." : "Toss in a thought..."}
            </Text>
            <Text variant="body" style={{ color: cosmic.moonWhite, marginBottom: spacing.xs, fontWeight: "600" }}>
              {locale === "ko"
                ? "만약 내가 작은 로봇 마음의 도서관을 만든다면?"
                : "What if I built a tiny library for a robot heart?"}
            </Text>
            <TextInput
              multiline
              value={draft}
              onChangeText={setDraft}
              editable={phase !== "generating"}
              placeholder={locale === "ko" ? "예: 밤빛 골목에서 등불이 한 개씩 켜진다…" : "e.g. lanterns light up one by one in a night alley…"}
              placeholderTextColor={cosmic.mistGray}
              style={styles.promptInput}
              accessibilityLabel={locale === "ko" ? "Divergent 입력" : "Divergent input"}
            />
            <View style={styles.previewPanel}>
              <Text variant="caption" color="textMuted">{locale === "ko" ? "생성될 장면" : "Scene seeds"}</Text>
              <View style={styles.previewStrip}>
                {[0, 1].map((index) => (
                  <View key={index} style={styles.previewTile}>
                    <IslandArt id={index === 0 ? "imagine" : "inspiration"} size={86} />
                    <View style={styles.previewFooter}>
                      <ShardArt id="imagine_pink" size={18} />
                      <Text variant="subtle" color="textMuted">0{index + 1}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {/* Result cards (pack §5) */}
        {(phase === "result" || phase === "saved") && result ? (
          <View style={{ gap: spacing.md }}>
            {result.title ? <Text variant="heading">{result.title}</Text> : null}
            {result.worldline ? (
              <View style={[styles.card, { borderLeftColor: cosmic.dreamPink }]}>
                <Text variant="caption" color="textMuted">{locale === "ko" ? "한 줄 세계관" : "Worldline"}</Text>
                <Text variant="body" style={{ marginTop: 2 }}>{result.worldline}</Text>
              </View>
            ) : null}

            {result.scenes.length > 0 ? (
              <View style={[styles.card, { borderLeftColor: cosmic.soulViolet }]}>
                <Text variant="caption" color="textMuted">{locale === "ko" ? "장면" : "Scenes"}</Text>
                {result.scenes.map((s, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text variant="body" style={{ fontWeight: "600" }}>{s.title}</Text>
                    {s.description ? <Text variant="subtle" color="textMuted">{s.description}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}

            {result.objects.length > 0 ? (
              <View style={[styles.card, { borderLeftColor: cosmic.pixelLamp }]}>
                <Text variant="caption" color="textMuted">{locale === "ko" ? "필요한 사물" : "Objects"}</Text>
                {result.objects.map((o, i) => (
                  <Text key={i} variant="body" style={{ marginTop: 2 }}>
                    <Text variant="body" style={{ fontWeight: "600" }}>{o.name}</Text>
                    {o.description ? `  ${o.description}` : ""}
                  </Text>
                ))}
              </View>
            ) : null}

            {result.characters.length > 0 ? (
              <View style={[styles.card, { borderLeftColor: cosmic.signalBlue }]}>
                <Text variant="caption" color="textMuted">{locale === "ko" ? "등장 캐릭터" : "Characters"}</Text>
                {result.characters.map((c, i) => (
                  <Text key={i} variant="body" style={{ marginTop: 2 }}>
                    <Text variant="body" style={{ fontWeight: "600" }}>{c.name}</Text>
                    {c.role ? `  ${c.role}` : ""}
                  </Text>
                ))}
              </View>
            ) : null}

            {result.nextStep ? (
              <View style={[styles.card, { borderLeftColor: cosmic.signalMint }]}>
                <Text variant="caption" color="textMuted">{locale === "ko" ? "다음 한 걸음" : "Next step"}</Text>
                <Text variant="body" style={{ marginTop: 2 }}>{result.nextStep}</Text>
              </View>
            ) : null}

            {phase === "saved" ? (
              <View style={styles.savedCard}>
                <Text variant="body" color="brand" style={{ fontWeight: "700" }}>
                  {locale === "ko" ? "마을에 공상 조각으로 저장됐어요" : "Saved to the village as a 공상 piece"}
                </Text>
                <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
                  {locale === "ko"
                    ? "지식 창고에서 다시 찾아볼 수 있어요."
                    : "You can find it again in your wiki."}
                </Text>
              </View>
            ) : (
              <Text variant="subtle" color="textMuted" style={styles.resultHint}>
                {locale === "ko"
                  ? "저장과 발전 액션은 위쪽 장면 무대에서 바로 이어갈 수 있어요."
                  : "Save or develop this scene from the stage actions above."}
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>
      {/* SecondB appears briefly while a scene sparks / is saved. */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.companionFlash} />
      ) : null}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  contextPillWrap: { marginTop: spacing.xs },
  promptCard: {
    backgroundColor: semantic.surface,
    borderColor: VILLAGE_UI.imagine.accent,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  panelTitle: {
    color: VILLAGE_UI.imagine.accent,
    letterSpacing: 0,
  },
  promptInput: {
    minHeight: 110,
    color: semantic.text,
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    textAlignVertical: "top",
    fontSize: 15,
  },
  previewPanel: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  previewStrip: {
    flexDirection: "row",
    gap: spacing.md,
  },
  previewTile: {
    flex: 1,
    minHeight: 126,
    overflow: "hidden",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.38)",
    backgroundColor: "rgba(7,10,24,0.84)",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.sm,
  },
  previewFooter: {
    width: "100%",
    minHeight: 32,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(167,139,250,0.2)",
  },
  card: {
    backgroundColor: "rgba(13,21,48,0.88)",
    borderColor: "rgba(141,152,184,0.34)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  itemRow: { marginTop: spacing.xs },
  savedCard: {
    backgroundColor: "rgba(114,242,199,0.06)",
    borderColor: "rgba(114,242,199,0.22)",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  resultHint: {
    textAlign: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
});
