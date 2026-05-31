// "공상 작업실" / Imagine workshop (imagine pack v2). Vela unfolds a rough
// idea into a structured result — 한 줄 세계관 / 장면 / 사물 / 등장 캐릭터 /
// 다음 한 걸음 — and saves it to the village as a 공상 조각.
//
// Generation goes through callGemini (purpose "imagine"), so C1/C3/C9 hold;
// the result is parsed into cards by parseImagineResult (never shown as raw
// chat text — pack §5). Save routes through captureFromMarkdown so the
// piece enters the knowledge layer / graph.

import { useEffect, useState } from "react";
import { Animated, ScrollView, StyleSheet, View, TextInput, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { CHARACTERS } from "@/lib/characters";
import { useImaginePulse } from "@/components/motion/useSignatureMotion";
import { WorkerSprite } from "@/components/art/WorkerSprite";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { ContextPill } from "@/components/premium";
import { callGemini } from "@/lib/llm/gemini";
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
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const vela = CHARACTERS.vela;
  const velaPulse = useImaginePulse();

  const params = useLocalSearchParams<{ fromNode?: string }>();
  const fromNode = typeof params.fromNode === "string" && params.fromNode.length > 0 ? params.fromNode : null;

  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<ParsedImagine | null>(null);
  const [saving, setSaving] = useState(false);
  const companion = useCompanionMoment();

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
    // 벨라 sparks as the idea starts unfolding (companion pack §3).
    companion.fire("imagineStarted");
    try {
      const system = fromNode
        ? `${IMAGINE_SYSTEM}\nThe user started from the graph node "${fromNode}"; gently let that color the scenes.`
        : IMAGINE_SYSTEM;
      const reply = await callGemini({ userId, locale, purpose: "imagine", system, user: draft.trim() });
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
      // 벨라 tucks the scene into the village (companion pack §3).
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

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header — Vela hero */}
        <View style={styles.header}>
          <View style={styles.velaSpriteSlot}>
            <Animated.View style={{ opacity: velaPulse.opacity, transform: [{ scale: velaPulse.scale }] }}>
              <WorkerSprite id="vela" size={56} />
            </Animated.View>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand" style={{ letterSpacing: 1.5 }}>
              {locale === "ko" ? "공상 작업실" : "Imagine workshop"}
            </Text>
            <Text variant="heading">{locale === "ko" ? "그 생각, 펼쳐볼까요?" : "Want to lay that out?"}</Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
              {locale === "ko" ? `${vela.name.ko} · ${vela.role.ko}` : `${vela.name.en} · ${vela.role.en}`}
            </Text>
          </View>
        </View>

        {/* nodeContext pill (pack §7) */}
        {fromNode ? (
          <View style={styles.contextPillWrap}>
            <ContextPill label={fromNode} />
          </View>
        ) : null}

        {/* Input panel — hidden once a result is showing */}
        {phase === "input" || phase === "generating" ? (
          <View style={styles.promptCard}>
            <Text variant="body" style={{ color: cosmic.dreamPink, marginBottom: spacing.xs }}>
              {locale === "ko"
                ? "아직 말이 안 되어도 괜찮아요. 떠오른 장면을 하나 던져주세요."
                : "It doesn't have to make sense yet. Just toss a scene you saw in your head."}
            </Text>
            <TextInput
              multiline
              value={draft}
              onChangeText={setDraft}
              editable={phase !== "generating"}
              placeholder={locale === "ko" ? "예: 밤빛 골목에서 등불이 한 개씩 켜진다…" : "e.g. lanterns light up one by one in a night alley…"}
              placeholderTextColor={cosmic.mistGray}
              style={styles.promptInput}
              accessibilityLabel={locale === "ko" ? "공상 입력" : "Imagine input"}
            />
            <Button
              label={
                phase === "generating"
                  ? locale === "ko" ? "장면으로 펼치는 중…" : "Unfolding into scenes…"
                  : locale === "ko" ? "장면으로 펼치기" : "Lay it out as scenes"
              }
              variant="primary"
              disabled={draft.trim().length === 0 || phase === "generating"}
              loading={phase === "generating"}
              onPress={handleGenerate}
            />
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
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Button label={locale === "ko" ? "지식 창고 열기" : "Open wiki"} variant="secondary" onPress={() => router.push("/wiki")} />
                  <Button label={locale === "ko" ? "또 펼치기" : "Unfold again"} variant="secondary" onPress={reset} />
                </View>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <Button
                  label={locale === "ko" ? "마을에 공상 조각으로 저장" : "Save to the village"}
                  variant="primary"
                  loading={saving}
                  disabled={saving}
                  onPress={handleSave}
                />
                <Button label={locale === "ko" ? "다시 펼치기" : "Unfold again"} variant="secondary" onPress={reset} />
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
      {/* 벨라 appears briefly while a scene sparks / is saved (companion pack §3) */}
      {companion.moment ? (
        <CompanionMoment moment={companion.moment} style={styles.companionFlash} />
      ) : null}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  velaSpriteSlot: {
    width: 64, height: 64,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,159,214,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,159,214,0.42)",
    alignItems: "center", justifyContent: "center",
  },
  contextPillWrap: { marginTop: spacing.xs },
  promptCard: {
    backgroundColor: "rgba(255,159,214,0.06)",
    borderColor: "rgba(255,159,214,0.18)",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  promptInput: {
    minHeight: 110,
    color: cosmic.moonWhite,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    textAlignVertical: "top",
    fontSize: 15,
  },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
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
});
