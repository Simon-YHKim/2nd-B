// 외부 자료 가져오기 / Import external self-knowledge (user request #2).
//
// Two ways in:
//   A. Copy an extraction prompt → paste into another assistant (ChatGPT /
//      Claude / Gemini) that has interviewed/analyzed you → paste its reply
//      back here.
//   B. Paste a past personality/disposition test result or free notes.
//
// Either way we don't just store it: callGemini(purpose "import_ingest")
// classifies + tags it into our analysis structure, then we save it through
// captureFromMarkdown so it enters the knowledge layer / graph like any piece
// — classified, tagged, and indexed. Mock build returns a structured stub.

import { useState } from "react";
import { View, StyleSheet, ScrollView, Alert, Platform, KeyboardAvoidingView } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumCard, PremiumButton, PremiumTextarea, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { callGemini } from "@/lib/llm/gemini";
import {
  buildExtractionPrompt,
  INGEST_SYSTEM,
  parseIngestResult,
  renderIngestMarkdown,
  type IngestResult,
} from "@/lib/wiki/import-external";
import { captureFromMarkdown } from "@/lib/wiki/capture";

type Phase = "input" | "analyzing" | "result" | "saved";

export default function ImportExternal() {
  const { i18n } = useTranslation();
  const { userId, loading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const ko = locale === "ko";

  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<IngestResult | null>(null);
  const [copied, setCopied] = useState(false);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  async function copyPrompt() {
    const prompt = buildExtractionPrompt(locale);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Native / unsupported: drop it into the paste box so the user can
        // long-press to copy it themselves.
        setRaw(prompt);
        Alert.alert(ko ? "프롬프트를 아래에 넣었어요" : "Prompt placed below", ko ? "길게 눌러 복사하세요." : "Long-press to copy it.");
      }
    } catch {
      setRaw(prompt);
    }
  }

  async function analyze() {
    if (!userId || raw.trim().length === 0 || phase === "analyzing") return;
    setPhase("analyzing");
    try {
      const reply = await callGemini({ userId, locale, purpose: "import_ingest", system: INGEST_SYSTEM, user: raw.trim(), minor: isMinor === true });
      setResult(parseIngestResult(reply.text, raw.trim()));
      setPhase("result");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[import] analyze failed", (e as Error).message);
      // Even if the LLM fails, fall back to the local parser so nothing is lost.
      setResult(parseIngestResult("", raw.trim()));
      setPhase("result");
    }
  }

  async function save() {
    if (!userId || !result) return;
    try {
      await captureFromMarkdown({
        userId,
        rawMd: renderIngestMarkdown(result, locale),
        fallbackUrl: null,
        kindOverride: "self_knowledge",
        userTags: result.tags,
        track: result.track,
      });
      setPhase("saved");
    } catch (e) {
      Alert.alert(ko ? "저장 실패" : "Save failed", (e as Error).message);
    }
  }

  function reset() {
    setRaw("");
    setResult(null);
    setPhase("input");
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SceneHero
            eyebrow={ko ? "08-5. 가져오기" : "08-5. Import"}
            title={ko ? "다른 곳의 나를 마을로 옮겨요" : "Bring outside self-knowledge home"}
            subtitle={ko ? "외부 AI · 검사 결과 · 메모" : "Other assistants · tests · notes"}
            island="knowledge"
            worker="momo"
            speech={
              ko
                ? "붙여넣은 내용은 바로 저장하지 않고, 먼저 구조에 맞게 분류해 보여줄게요."
                : "Pasted material is sorted first, then saved only when you confirm."
            }
            islandSize={250}
            workerSize={104}          />

          {phase === "input" || phase === "analyzing" ? (
            <>
              {/* Path A — extraction prompt */}
              <PremiumCard
                eyebrow={ko ? "다른 AI에서 가져오기" : "From another assistant"}
                title={ko ? "탐구 프롬프트 복사" : "Copy the extraction prompt"}
                accent={cosmic.soulViolet}
              >
                <Text variant="body" color="textMuted">
                  {ko
                    ? "나에 대해 많이 대화한 다른 AI가 있다면, 이 프롬프트를 붙여넣어 정리된 답을 받아 아래에 다시 붙여넣어요."
                    : "If another assistant has talked with you a lot, paste this prompt there, then paste its reply below."}
                </Text>
                <PremiumButton
                  label={copied ? (ko ? "복사됐어요" : "Copied") : ko ? "프롬프트 복사" : "Copy prompt"}
                  variant="secondary"
                  onPress={copyPrompt}
                />
              </PremiumCard>

              {/* Path B — paste */}
              <PremiumCard
                eyebrow={ko ? "붙여넣기" : "Paste"}
                title={ko ? "받은 답 또는 검사 결과" : "Reply or test result"}
                accent={cosmic.signalMint}
              >
                <Text variant="body" color="textMuted">
                  {ko
                    ? "위에서 받은 답, 예전에 한 성향·성격 검사 결과, 혹은 나에 대한 메모를 그대로 붙여넣어요. 우리 구조에 맞게 분류하고 태그를 달아 보관해요."
                    : "Paste the reply, a past disposition/personality test result, or notes about you. We'll sort and tag it into your structure."}
                </Text>
                <PremiumTextarea
                  value={raw}
                  onChangeText={setRaw}
                  editable={phase !== "analyzing"}
                  placeholder={ko ? "여기에 붙여넣기…" : "Paste here…"}
                  accessibilityLabel={ko ? "가져올 자료" : "Material to import"}
                  style={{ minHeight: 160 }}
                />
                <PremiumButton
                  label={ko ? "분류하고 정리하기" : "Sort & organize"}
                  variant="primary"
                  loading={phase === "analyzing"}
                  disabled={raw.trim().length === 0 || phase === "analyzing"}
                  onPress={analyze}
                  full
                />
              </PremiumCard>
            </>
          ) : null}

          {(phase === "result" || phase === "saved") && result ? (
            <>
              <PremiumCard
                eyebrow={ko ? "이렇게 정리했어요" : "Here's how we sorted it"}
                title={ko ? "가져온 조각" : "Imported piece"}
                accent={cosmic.pixelLamp}
                glow
              >
                {result.summary ? <Text variant="body">{result.summary}</Text> : null}
                <View style={styles.tagRow}>
                  {result.tags.map((t) => (
                    <View key={t} style={styles.tagChip}><Text variant="caption" color="brand">#{t}</Text></View>
                  ))}
                </View>
                <Text variant="subtle" color="textSubtle">
                  {ko ? `${result.items.length}개 항목 · ${result.track === "pro" ? "일·전문" : "일상"}` : `${result.items.length} items · ${result.track}`}
                </Text>
              </PremiumCard>

              {result.items.map((it, i) => (
                <View key={i} style={styles.itemRow}>
                  <View style={[styles.itemDot, { backgroundColor: SECTION_ACCENT[it.section] }]} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{it.title}</Text>
                    {it.detail ? <Text variant="subtle" color="textMuted">{it.detail}</Text> : null}
                  </View>
                </View>
              ))}

              {phase === "result" ? (
                <PremiumButton label={ko ? "마을에 보관하기" : "Keep it in the village"} variant="primary" onPress={save} full />
              ) : (
                <PremiumCard accent={cosmic.signalMint} glow>
                  <Text variant="body" color="brand">{ko ? "잘 보관했어요" : "Saved"}</Text>
                  <Text variant="subtle" color="textMuted">
                    {ko ? "이 조각들은 나의 중심과 세컨비가 참고해요." : "Your center and SecondB will draw on these."}
                  </Text>
                  <View style={styles.savedActions}>
                    <PremiumButton label={ko ? "그래프 보기" : "See the graph"} variant="secondary" onPress={() => router.push("/")} style={{ flex: 1 }} />
                    <PremiumButton label={ko ? "더 가져오기" : "Import more"} variant="ghost" onPress={reset} style={{ flex: 1 }} />
                  </View>
                </PremiumCard>
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </PremiumAppShell>
  );
}

const SECTION_ACCENT: Record<string, string> = {
  trait: cosmic.soulViolet,
  value: cosmic.pixelLamp,
  relationship: cosmic.guardRose,
  motivation: cosmic.signalMint,
  context: cosmic.signalBlue,
  preference: cosmic.dreamPink,
};

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: 120 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  tagChip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.sm },
  itemDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  savedActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
});
