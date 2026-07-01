import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { router } from "expo-router";

import { DeepSpaceHubDock, SecondbStatusHeader, type DeepSpaceHubTab } from "@/components/deepspace";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";

const HEADER_COPY: Record<DeepSpaceHubTab, { text: string; tip: string }> = {
  capture: { text: "담기 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
  secondb: { text: "세컨비챗 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
  trend: { text: "트렌드 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
  review: { text: "점검 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
};

export function DeepSpaceHubDockScreen() {
  const [active, setActive] = useState<DeepSpaceHubTab>("capture");
  const [captureMode, setCaptureMode] = useState("글");
  const [captured, setCaptured] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSent, setChatSent] = useState(false);
  const [trendAction, setTrendAction] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"hold" | "approve" | null>(null);
  const header = HEADER_COPY[active];
  const title = useMemo(() => ({ capture: "담기", secondb: "세컨비", trend: "트렌드", review: "점검" })[active], [active]);

  return (
    <View style={styles.screen}>
      <View style={styles.phoneShadow}>
        <View style={styles.phone}>
          <View style={styles.starField} pointerEvents="none">
          <View style={[styles.microStar, styles.microStarA]} />
          <View style={[styles.microStar, styles.microStarB]} />
        </View>
        <View style={styles.statusBar}>
          <RNText style={styles.statusText}>9:41</RNText>
          <RNText style={styles.statusText}>●●● ▮</RNText>
        </View>
        <SecondbStatusHeader mood={active === "capture" ? "neutral" : "positive"} text={header.text} tip={header.tip} />
        <View style={styles.titleRow}>
          <RNText style={styles.back}>‹</RNText>
          <Text variant="heading" style={styles.title}>{title}</Text>
          <Text variant="caption" pixelEn style={styles.kicker}>{active === "capture" ? "5 MODE" : active === "review" ? "RATIFY" : active === "trend" ? "DISCOVER" : "공상"}</Text>
        </View>
        <View style={styles.content}>
          {renderContent(active, {
            captureMode,
            setCaptureMode,
            captured,
            setCaptured,
            chatDraft,
            setChatDraft,
            chatSent,
            setChatSent,
            trendAction,
            setTrendAction,
            reviewDecision,
            setReviewDecision,
          })}
        </View>
        <DeepSpaceHubDock active={active} onChange={setActive} />
        </View>
      </View>
    </View>
  );
}

interface HubState {
  captureMode: string;
  setCaptureMode: (mode: string) => void;
  captured: boolean;
  setCaptured: (value: boolean) => void;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  chatSent: boolean;
  setChatSent: (value: boolean) => void;
  trendAction: string | null;
  setTrendAction: (value: string | null) => void;
  reviewDecision: "hold" | "approve" | null;
  setReviewDecision: (value: "hold" | "approve") => void;
}

function renderContent(active: DeepSpaceHubTab, state: HubState) {
  if (active === "capture") return <CaptureContent {...state} />;
  if (active === "secondb") return <SecondbContent {...state} />;
  if (active === "trend") return <TrendContent {...state} />;
  return <ReviewContent {...state} />;
}

function CaptureContent({ captureMode, setCaptureMode, captured, setCaptured }: HubState) {
  return (
    <>
      <Text variant="body" style={styles.subtitle}>무엇이든 한 곳으로 담는다</Text>
      <View style={styles.modeRow}>
        {["글", "사진", "링크", "음성", "할 일"].map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="tab"
            accessibilityState={{ selected: captureMode === mode }}
            onPress={() => setCaptureMode(mode)}
          >
            <Text variant="caption" style={[styles.modeChip, captureMode === mode && styles.modeChipActive]}>{mode}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.captureBox}><Text variant="body" style={styles.captureText}>오늘 회의에서 나온 아이디어, 사용자 온보딩을 별자리 은유로 풀면 어떨까</Text><View style={styles.cursor} /></View>
      <View style={styles.tagRow}><Text variant="caption" pixelEn style={styles.tag}>#아이디어</Text><Text variant="caption" pixelEn style={styles.tag}>AI 자동 태그</Text></View>
      <Text variant="caption" pixelEn style={styles.sectionLabel}>최근에 담은 것</Text>
      <SmallRow icon="✎" title="읽은 책에서 인상 깊었던 문장" time="2시간" />
      <SmallRow icon="🔗" title="디자인 레퍼런스 아티클" time="어제" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="현재 조각 담기"
        onPress={() => setCaptured(true)}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedButton]}
      >
        <Text variant="caption" style={styles.primaryButtonText}>{captured ? "담겼어요" : "담기"}</Text>
      </Pressable>
    </>
  );
}

function SecondbContent({ chatDraft, setChatDraft, chatSent, setChatSent }: HubState) {
  return (
    <View style={styles.chatStack}>
      <Text variant="body" style={styles.userBubble}>나 요즘 너무 산만한 것 같아. 예전엔 안 그랬는데?</Text>
      <View style={styles.aiGroup}>
        <Text variant="body" style={styles.aiBubble}>기록을 보면 3월부터 작업 전환이 잦아졌어요. 외향성이 오른 시기와 겹쳐요. 산만함보다 관심이 넓어진 신호일 수 있어요.</Text>
        <Text variant="subtle" style={styles.evidence}>📎 내 기록 3건 근거</Text>
      </View>
      {chatSent ? <Text variant="subtle" style={styles.sentNote}>보냈어요. 실제 대화 저장 연결은 다음 단계 TODO입니다.</Text> : null}
      <View style={styles.inputBar}>
        <TextInput
          accessibilityLabel="세컨비에게 물어보기"
          placeholder="세컨비에게 물어보기…"
          placeholderTextColor={colors.textLo}
          value={chatDraft}
          onChangeText={setChatDraft}
          style={styles.inputText}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="세컨비에게 보내기"
          disabled={chatDraft.trim().length === 0}
          onPress={() => setChatSent(true)}
          style={({ pressed }) => [styles.sendCircle, pressed && styles.pressedButton, chatDraft.trim().length === 0 && styles.disabledButton]}
        >
          <RNText style={styles.sendText}>↑</RNText>
        </Pressable>
      </View>
    </View>
  );
}

function TrendContent({ trendAction, setTrendAction }: HubState) {
  return (
    <>
      <Text variant="body" style={styles.subtitle}>요즘 너의 관심이 향하는 다음 한 걸음</Text>
      <TrendCard title="자기이해 도구" delta="▲ 관심 +32%" body="최근 3주간 가장 자주 담은 주제. 관련 검사 애착(ECR-S)를 해볼까요?" onPress={() => setTrendAction("자기이해 도구")} />
      <TrendCard title="아침 루틴" delta="▲ 관심 +18%" body="기분이 좋은 날의 공통점. 리듬에 기록을 더 담아볼까요?" onPress={() => setTrendAction("아침 루틴")} />
      {trendAction ? <Text variant="subtle" style={styles.sentNote}>{trendAction} 제안을 열 준비가 됐어요.</Text> : null}
      <View style={styles.emptyCard}><Text variant="body" style={styles.mutedBody}>데이터가 더 쌓이면 새로운 제안이 나타납니다.</Text></View>
    </>
  );
}

function ReviewContent({ reviewDecision, setReviewDecision }: HubState) {
  return (
    <>
      <Text variant="body" style={styles.subtitle}>내가 달라졌다면 별자리도 함께 점검</Text>
      <View style={styles.reviewCard}>
        <Text variant="caption" pixelEn style={styles.sectionLabelSoul}>세컨비의 제안</Text>
        <Text variant="body" style={styles.reviewBody}>최근 기록을 보면 외향성이 올라간 것 같아요. 별 밝기를 올릴까요?</Text>
        <View style={styles.scoreRow}><Score label="지금" value="61" /><RNText style={styles.arrow}>→</RNText><Score label="제안" value="68" /><Text variant="subtle" style={styles.evidenceRight}>근거{"\n"}기록 5건</Text></View>
      </View>
      <Text variant="subtle" style={styles.reviewNote}>승인해야만 반영됩니다 · 모든 제안은 기록에 남습니다</Text>
      {reviewDecision ? <Text variant="subtle" style={styles.sentNote}>{reviewDecision === "approve" ? "승인됨" : "보류됨"}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="제안 보류" onPress={() => setReviewDecision("hold")} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}><Text variant="caption" style={styles.secondaryButtonText}>보류</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="제안 승인" onPress={() => setReviewDecision("approve")} style={({ pressed }) => [styles.soulButton, pressed && styles.pressedButton]}><Text variant="caption" style={styles.soulButtonText}>승인</Text></Pressable>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel="오늘의 정리 열기" onPress={() => router.push("/digest")} style={{ marginTop: spacing.sm, alignSelf: "center" }}>
        <Text variant="caption" color="brand">오늘의 정리 열기 →</Text>
      </Pressable>
    </>
  );
}

function SmallRow({ icon, title, time }: { icon: string; title: string; time: string }) {
  return <View style={styles.smallRow}><RNText style={styles.rowIcon}>{icon}</RNText><Text variant="body" style={styles.rowTitle} numberOfLines={1}>{title}</Text><Text variant="subtle" style={styles.rowTime}>{time}</Text></View>;
}

function TrendCard({ title, delta, body, onPress }: { title: string; delta: string; body: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title} 제안 열기`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressedButton]}><View style={styles.cardHead}><Text variant="heading" style={styles.cardTitle}>{title}</Text><Text variant="subtle" style={styles.delta}>{delta}</Text></View><Text variant="body" style={styles.cardBody}>{body}</Text></Pressable>;
}

function Score({ label, value }: { label: string; value: string }) {
  return <View style={styles.score}><Text variant="subtle" style={styles.scoreLabel}>{label}</Text><Text variant="heading" style={styles.scoreValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 40, backgroundColor: colors.bgDeep },
  phoneShadow: { width: 320, height: 680, borderRadius: radius.phone, shadowColor: colors.bgDeep, shadowOpacity: 0.6, shadowRadius: 80, shadowOffset: { width: 0, height: 30 }, elevation: 10, backgroundColor: "transparent" },
  phone: { position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: radius.phone, backgroundColor: colors.bgDeep, borderWidth: 1, borderColor: colors.borderHi },
  starField: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  microStar: { position: "absolute", width: 2, height: 2, borderRadius: 1, backgroundColor: colors.cyanDim, opacity: 0.5 },
  microStarA: { top: 82, left: 72 },
  microStarB: { top: 108, right: 70, opacity: 0.4 },
  statusBar: { position: "relative", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 14 },
  statusText: { color: colors.textMid, fontFamily: fontFamilies.pixelKo, fontSize: 11, lineHeight: 16 },
  titleRow: { position: "relative", flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 20, paddingTop: 16 },
  back: { color: colors.textTitle, opacity: 0.7, fontSize: 18, lineHeight: 22 },
  title: { color: colors.textTitle, fontSize: 16 },
  kicker: { marginLeft: "auto", color: colors.cyanBright, opacity: 0.55, fontSize: 7, lineHeight: 12 },
  content: { position: "relative", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 86, minHeight: 454 },
  subtitle: { color: colors.textMid, fontSize: 13, marginBottom: spacing.md },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: spacing.md },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.cardBg, color: colors.cyanSoft, fontSize: 12 },
  modeChipActive: { borderColor: colors.borderHi, backgroundColor: colors.mist, color: colors.textTitle },
  captureBox: { minHeight: 128, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.cardBg, paddingHorizontal: 15, paddingVertical: 14, flexDirection: "row" },
  captureText: { flex: 1, color: colors.textTitle, fontSize: 13.5 },
  cursor: { width: 2, height: 15, marginTop: 3, backgroundColor: colors.cyan },
  tagRow: { flexDirection: "row", gap: 7, marginTop: spacing.sm },
  tag: { color: colors.cyanBright, opacity: 0.55, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, fontSize: 6, lineHeight: 10 },
  sectionLabel: { color: colors.cyanBright, opacity: 0.55, marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: 7, lineHeight: 12 },
  smallRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.ruleSoft, borderRadius: 10, backgroundColor: colors.cardBg, marginBottom: spacing.sm },
  rowIcon: { fontSize: 14, lineHeight: 18 },
  rowTitle: { flex: 1, color: colors.textMid, fontSize: 12.5 },
  rowTime: { color: colors.cyanBright, opacity: 0.4, fontSize: 10 },
  primaryButton: { marginTop: spacing.md, padding: 13, borderRadius: 12, backgroundColor: colors.cyanBright, alignItems: "center" },
  pressedButton: { opacity: 0.72 },
  disabledButton: { opacity: 0.42 },
  primaryButtonText: { color: colors.bgDeep, fontSize: 14, fontWeight: "700" },
  chatStack: { gap: 12 },
  userBubble: { alignSelf: "flex-end", maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.mist, color: colors.textTitle, fontSize: 13 },
  aiGroup: { alignSelf: "flex-start", maxWidth: "82%" },
  aiBubble: { paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.bgMid, color: colors.cyanSoft, fontSize: 13 },
  evidence: { alignSelf: "flex-start", marginTop: 7, color: colors.cyanBright, opacity: 0.55, borderWidth: 1, borderColor: colors.ruleSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10 },
  inputBar: { marginTop: 218, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: 14, paddingRight: 8, paddingVertical: 8, borderWidth: 1, borderColor: colors.borderHi, borderRadius: 22, backgroundColor: colors.bgMid },
  inputText: { flex: 1, minHeight: 34, color: colors.textTitle, fontFamily: fontFamilies.readable, fontSize: 13, lineHeight: 18, paddingVertical: 0 },
  sendCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanBright },
  sendText: { color: colors.bgDeep, fontSize: 15, lineHeight: 18 },
  card: { paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.cardBg, marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: spacing.sm },
  cardTitle: { color: colors.textTitle, fontSize: 13 },
  delta: { marginLeft: "auto", color: colors.mint, fontSize: 10 },
  cardBody: { color: colors.textMid, fontSize: 12.5 },
  emptyCard: { paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderHi, borderRadius: 14, backgroundColor: colors.cardBg },
  mutedBody: { color: colors.textLo, fontSize: 12.5 },
  reviewCard: { padding: 16, borderWidth: 1, borderColor: colors.soulLine, borderRadius: 14, backgroundColor: colors.cardBg },
  sectionLabelSoul: { color: colors.soul, marginBottom: 12, fontSize: 7, lineHeight: 12 },
  reviewBody: { color: colors.textTitle, marginBottom: 13, fontSize: 13 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.bgMid },
  score: { alignItems: "center" },
  scoreLabel: { color: colors.textLo, fontSize: 10 },
  scoreValue: { color: colors.cyanSoft, fontSize: 18 },
  arrow: { color: colors.soul, fontSize: 16, lineHeight: 20 },
  evidenceRight: { marginLeft: "auto", color: colors.cyanBright, opacity: 0.55, textAlign: "right", fontSize: 10 },
  reviewNote: { marginTop: spacing.md, textAlign: "center", color: colors.cyanBright, opacity: 0.5, fontSize: 11 },
  sentNote: { marginTop: spacing.sm, color: colors.mint, fontSize: 11, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: 138 },
  secondaryButton: { flex: 1, padding: 12, borderWidth: 1, borderColor: colors.borderHi, borderRadius: 12, alignItems: "center", backgroundColor: colors.cardBg },
  secondaryButtonText: { color: colors.cyanSoft, fontSize: 13 },
  soulButton: { flex: 1.4, padding: 12, borderRadius: 12, alignItems: "center", backgroundColor: colors.soul },
  soulButtonText: { color: colors.bgDeep, fontSize: 13, fontWeight: "700" },
});
