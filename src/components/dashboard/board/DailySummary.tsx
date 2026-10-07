// S-01 하루 요약(PS-DASH-001 v2.2). P-02 오늘의 한마디를 누르면 열린다.
//
// 봇 말풍선이 차례로 나타난다: 머리(청록) -> 사실 카드 -> 연결(청록) -> 제안(청록 = AI, 회색 = 규칙) -> 개수 한 줄.
// 순서와 색은 계약(summary.bubbles 의 순서 · basis)만 읽는다. [읽기]를 누르면 나타나는 말풍선을 따라 읽고,
// [정지]로 멈춘다. 무음이면 글만 보인다(진행은 summary-flow.ts).

import { useEffect, useReducer, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import type { BoardText, DailySummary as DailySummaryContract } from "@/lib/dashboard/board/contract";
import { fillHealthBlanks, startSummaryFlow, summaryFlow, type SummaryFlowEvent, type SummaryFlowState } from "@/lib/dashboard/board/summary-flow";
import { boardTone } from "@/lib/dashboard/board/tone";
import { speakLine, stopSpeaking } from "@/lib/speech/read-aloud";
import { m3 } from "@/lib/theme/m3";

/** 말풍선 사이 간격. 읽지 않을 때만 쓴다(읽을 때는 말이 끝나야 다음이 나온다). */
const BUBBLE_INTERVAL_MS = 900;

function Text({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.text, style]} />;
}

export function DailySummary({ summary, healthValues, muted, reducedMotion, go, onClose }: {
  summary: DailySummaryContract | null;
  healthValues: Record<string, string>;
  muted: boolean;
  reducedMotion: boolean;
  go: (route: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("ops");
  const bubbles = summary?.bubbles ?? [];
  const total = bubbles.length;
  const [flow, dispatch] = useReducer(
    (state: SummaryFlowState, event: SummaryFlowEvent) => summaryFlow(state, event, total, muted),
    undefined, () => startSummaryFlow(total, reducedMotion),
  );
  const say = (value: BoardText) => fillHealthBlanks("text" in value ? value.text : t(value.key, value.params), healthValues, t("phone.board.summary.noValue"));
  const sayRef = useRef(say);
  sayRef.current = say;

  // 읽지 않을 때: 말풍선이 하나씩 나타난다.
  useEffect(() => {
    if (flow.reading || flow.shown >= total) return;
    const timer = setTimeout(() => dispatch({ type: "tick" }), BUBBLE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [flow.reading, flow.shown, total]);

  // 읽을 때: 지금 말풍선을 읽고, 끝나면 다음으로.
  useEffect(() => {
    if (flow.speaking === null || muted) return;
    const index = flow.speaking;
    const bubble = bubbles[index];
    if (!bubble) return;
    speakLine(sayRef.current(bubble.line), i18n.language, {
      onDone: () => dispatch({ type: "spoken", index }),
      onError: () => dispatch({ type: "stop" }),
    });
  }, [flow.speaking, muted]); // 말풍선 하나에 한 번만 읽는다(문장은 sayRef 로 읽는다)

  // 화면을 떠나면 읽기를 멈춘다.
  useEffect(() => () => stopSpeaking(), []);

  const stop = () => { stopSpeaking(); dispatch({ type: "stop" }); };
  const close = () => { stopSpeaking(); onClose(); };

  if (!summary || total === 0) return <View style={styles.page}>
    <Text variant="heading">{t("phone.board.summary.titleDefault")}</Text>
    <Text variant="body" style={styles.muted}>{t("phone.board.summary.notReady")}</Text>
    <PixelPressable onPress={close} accessibilityLabel={t("phone.board.summary.close")} contentStyle={styles.button}>
      <Text variant="body">{t("phone.board.summary.close")}</Text>
    </PixelPressable>
  </View>;

  return <View testID="board-summary" style={styles.page}>
    <Text variant="heading" accessibilityRole="header">{t(`phone.board.summary.title.${summary.slot}`)}</Text>
    <View accessibilityLiveRegion="polite" style={styles.bubbles}>
      {bubbles.slice(0, flow.shown).map((bubble, index) => {
        const tone = boardTone(bubble.basis);
        return <View key={bubble.id} style={[styles.bubble, bubble.kind === "fact" ? styles.factCard : null,
          { borderColor: tone.border, borderStyle: tone.borderStyle }, flow.speaking === index && styles.speaking]}>
          <Text variant={bubble.kind === "head" ? "body" : "caption"} style={[styles.flex, { color: bubble.kind === "count" ? m3.color.onSurfaceVariant : tone.text }]}>{say(bubble.line)}</Text>
          {bubble.evidenceRoute ? <Pressable accessibilityRole="link" accessibilityLabel={t("phone.board.evidence")} onPress={() => go(bubble.evidenceRoute!)} style={styles.evidence}>
            <PixelGlyph name="description" size={16} color={tone.text} />
          </Pressable> : null}
        </View>;
      })}
    </View>
    {muted ? <Text variant="caption" style={styles.muted}>{t("phone.board.summary.mutedNote")}</Text> : null}
    <View style={styles.actions}>
      {!muted ? <PixelPressable onPress={() => (flow.reading ? stop() : dispatch({ type: "read" }))}
        accessibilityLabel={t(flow.reading ? "phone.board.summary.stop" : "phone.board.summary.read")} contentStyle={styles.button}>
        <PixelGlyph name={flow.reading ? "pause" : "play_arrow"} size={18} color={m3.color.onSurface} />
        <Text variant="body">{t(flow.reading ? "phone.board.summary.stop" : "phone.board.summary.read")}</Text>
      </PixelPressable> : null}
      <PixelPressable onPress={close} accessibilityLabel={t("phone.board.summary.close")} contentStyle={styles.button}>
        <Text variant="body">{t("phone.board.summary.close")}</Text>
      </PixelPressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  text: { color: m3.color.onSurface },
  page: { gap: 10 },
  bubbles: { gap: 8 },
  bubble: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, padding: 10, backgroundColor: m3.color.surfaceContainer, alignSelf: "flex-start", maxWidth: "92%" },
  factCard: { alignSelf: "stretch", maxWidth: "100%" },
  speaking: { borderWidth: 2 },
  flex: { flexShrink: 1 },
  muted: { color: m3.color.onSurfaceVariant },
  evidence: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 44, minWidth: 44, flexDirection: "row", gap: 6, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
});
