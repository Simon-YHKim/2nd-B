// S-01 하루 요약(PS-DASH-001 v2.2). P-02 오늘의 한마디를 누르면 열린다.
//
// 봇 말풍선이 차례로 나타난다: 머리(청록) -> 사실 카드 -> 연결(청록) -> 제안(청록 = AI, 회색 = 규칙) -> 개수 한 줄.
// 순서와 색은 계약(summary.bubbles 의 순서 · basis)만 읽는다. [읽기]를 누르면 나타나는 말풍선을 따라 읽고,
// [정지]로 멈춘다. 무음이면 글만 보인다(진행은 summary-flow.ts).

import { useEffect, useReducer, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import type { BoardText, NotePart, DailySummary as DailySummaryContract } from "@/lib/dashboard/board/contract";
import { fillHealthBlanks, startSummaryFlow, summaryFlow, type SummaryFlowEvent, type SummaryFlowState } from "@/lib/dashboard/board/summary-flow";
import { boardTone } from "@/lib/dashboard/board/tone";
import { speakLine, stopSpeaking } from "@/lib/speech/read-aloud";
import { phoneIos } from "@/lib/theme/phone-ios";
import { IosButton, IosLargeTitle, IosText as Text } from "./IosParts";

/** 말풍선 사이 간격. 읽지 않을 때만 쓴다(읽을 때는 말이 끝나야 다음이 나온다). */
const BUBBLE_INTERVAL_MS = 900;

export function DailySummary({ note, summary, healthValues, muted, reducedMotion, go, onClose }: {
  note?: NotePart;
  summary: DailySummaryContract | null;
  healthValues: Record<string, string>;
  muted: boolean;
  reducedMotion: boolean;
  go: (route: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("ops");
  // The two generation purposes stay separate; only their presentation is joined.
  const bubbles = [...(note?.line ? [{ id: "daily-note", kind: "head" as const, line: note.line, basis: note.basis, evidenceRoute: note.evidenceRoute }] : []), ...(summary?.bubbles ?? [])];
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

  if (total === 0) return <View style={styles.page}>
    <IosLargeTitle>{t("phone.board.shelf.parts.note")}</IosLargeTitle>
    <PixelRoundRect fill={phoneIos.cell} style={styles.empty}>
      <PixelGlyph name="chat" size={24} color={phoneIos.blue} />
      <Text accessibilityLiveRegion="polite" variant="body" style={styles.muted}>{summary?.note ? say(summary.note) : t("phone.board.summary.notReady")}</Text>
      {summary?.action ? <IosButton label={say(summary.action.label)} onPress={() => go(summary.action!.route)} /> : null}
    </PixelRoundRect>
    <View style={styles.actions}><IosButton label={t("phone.board.summary.close")} onPress={close} /></View>
  </View>;

  // 메시지식 말풍선(픽셀 아이폰): 바탕색은 basis 가 정한다(청록 = AI · 흰 칸 = 사실 · 회색 = 규칙 제안).
  return <View testID="board-summary" style={styles.page}>
    <IosLargeTitle>{t("phone.board.shelf.parts.note")}</IosLargeTitle>
    <View accessibilityLiveRegion="polite" style={styles.bubbles}>
      {bubbles.slice(0, flow.shown).map((bubble, index) => {
        const tone = boardTone(bubble.basis);
        return <View key={bubble.id}>
          {bubble.id === "head" ? <Text variant="caption" style={styles.muted}>{t("phone.summaryDetails")}</Text> : null}
          <PixelRoundRect fill={tone.bubble} border={flow.speaking === index ? phoneIos.blue : undefined}
          style={[styles.bubble, bubble.kind === "fact" ? styles.factCard : null]}>
          <Text variant={bubble.kind === "head" ? "body" : "caption"} style={[styles.flex, { color: bubble.kind === "count" ? phoneIos.label2 : bubble.basis === "ai" ? tone.text : phoneIos.label }]}>{say(bubble.line)}</Text>
          {bubble.evidenceRoute ? <Pressable accessibilityRole="link" accessibilityLabel={t("phone.board.evidence")} onPress={() => go(bubble.evidenceRoute!)} style={styles.evidence}>
            <PixelGlyph name="description" size={16} color={phoneIos.blue} />
          </Pressable> : null}
        </PixelRoundRect></View>;
      })}
    </View>
    {!summary?.bubbles.length && summary?.note ? <Text variant="caption" style={styles.muted}>{say(summary.note)}</Text> : null}
    {muted ? <Text variant="caption" style={styles.muted}>{t("phone.board.summary.mutedNote")}</Text> : null}
    <View style={styles.actions}>
      {!muted ? <IosButton primary glyph={flow.reading ? "pause" : "play_arrow"} onPress={() => (flow.reading ? stop() : dispatch({ type: "read" }))}
        label={t(flow.reading ? "phone.board.summary.stop" : "phone.board.summary.read")} /> : null}
      <IosButton label={t("phone.board.summary.close")} onPress={close} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  empty: { padding: 14, gap: 12 },
  page: { gap: 10 },
  bubbles: { gap: 8 },
  bubble: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start", maxWidth: "92%" },
  factCard: { alignSelf: "stretch", maxWidth: "100%" },
  flex: { flexShrink: 1 },
  muted: { color: phoneIos.label2 },
  evidence: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
