// LoadingScreen — phase-driven typewriter + logo opacity fade.
//
// "내 머릿속의 열일하는 세포들" — the loading sequence IS the brand:
// cell-team metaphors per docs/DESIGN.md. 25 messages across 5 build
// phases (Soma → Neuron → Cortex → Cerebrum → Ready), 1.5s per
// message (1s typing + 0.5s hold).
//
// Self-contained: no provider or font dependency, so it renders both
// during _layout font load and during in-screen auth resolution. The
// legacy light version is preserved in LoadingScreen.legacy.tsx.

import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

// Logo with glow — resolves to the root assets/ dir.
const logo = require("../../../assets/images/logo-glow.png");

// Per docs/DESIGN.md: each phase = 5 messages. First message of each
// phase is the technical anchor; the next four are cell-team prose.
const MESSAGES: readonly string[] = [
  // Phase 1 — Soma (0..20%)
  "Soma 형성 중...",
  "영차영차! 단백질 블록 운반 중.",
  "자재 반입 완료! 일꾼 세포 투입.",
  "읏차! 튼튼한 코어 빚는 중.",
  "세포 조립 라인 풀가동!",
  // Phase 2 — Neuron (20..40%)
  "Neuron 형성 중...",
  "쫙쫙! 축삭돌기 연장 중.",
  "찌릿! 통신 케이블 연결.",
  "바쁘다 바빠! 시냅스 땜질 중.",
  "신경 회로 엉키지 않게 조심조심!",
  // Phase 3 — Cortex (40..60%)
  "Cortex 형성 중...",
  "꾹꾹! 뇌 주름 접는 중.",
  "표면적을 넓혀라! 세포들 뜀박질.",
  "고급 정보 구역 뼈대 세우기.",
  "차곡차곡! 빈틈없이 피질 쌓기.",
  // Phase 4 — Cerebrum (60..80%)
  "Cerebrum 형성 중...",
  "탁! 메인 컨트롤 룸 점등.",
  "좌우뇌 통신 완료! 중앙 다리 연결.",
  "쓱싹쓱싹, 지휘소 대청소 중.",
  "뇌 조립 막바지! 최종 점검.",
  // Phase 5 — Ready (80..100%)
  "사용자의 생각을 받아들일 준비 중...",
  "수신 안테나 쫙! 아이디어 대기.",
  "신경망 스탠바이! 환영 게이트 개방.",
  "꿀꺽. 일꾼들 긴장하며 대기 선 열쇠.",
  "두근두근! 멋진 생각 기대 중!",
] as const;

// Each message: 1s typing + 0.5s hold = 1.5s slot.
const TYPE_TARGET_MS = 1000;
const HOLD_MS = 500;
const PER_MESSAGE_MS = TYPE_TARGET_MS + HOLD_MS;
// Total fade duration = number of messages × per-message slot.
const TOTAL_MS = MESSAGES.length * PER_MESSAGE_MS;

export function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const opacity = useRef(new Animated.Value(1)).current;

  // Fade logo opacity 1 → 0 over TOTAL_MS in lockstep with the typewriter.
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: TOTAL_MS,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  // Per-message lifecycle: type chars at (1s / length) interval,
  // then schedule advance to next message after PER_MESSAGE_MS.
  useEffect(() => {
    if (msgIdx >= MESSAGES.length) return; // done — last message stays on screen
    const text = MESSAGES[msgIdx];
    setTyped("");

    let i = 0;
    const typeId = setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) clearInterval(typeId);
    }, Math.max(20, TYPE_TARGET_MS / text.length));

    const advanceId = setTimeout(() => {
      setMsgIdx((idx) => idx + 1);
    }, PER_MESSAGE_MS);

    return () => {
      clearInterval(typeId);
      clearTimeout(advanceId);
    };
  }, [msgIdx]);

  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel="2nd-Brain 불러오는 중"
    >
      <Animated.Image
        source={logo}
        style={[styles.logo, { opacity }]}
        resizeMode="contain"
      />
      <Text style={styles.text}>
        {typed}
        <Text style={styles.caret}>▍</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#02040A",
    gap: 32,
  },
  logo: { width: 220, height: 220 },
  text: {
    color: "#C7D4EA",
    fontSize: 15,
    letterSpacing: 0.3,
    minHeight: 22,
  },
  caret: {
    color: "#2F97FC",
    opacity: 0.8,
  },
});
