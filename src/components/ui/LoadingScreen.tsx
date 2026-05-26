// LoadingScreen — phase-driven typewriter → pulse-and-tap → dolly zoom.
//
// "내 머릿속의 열일하는 세포들" — the loading sequence IS the brand
// (docs/DESIGN.md). 25 messages across 5 build phases (Soma → Neuron →
// Cortex → Cerebrum → Ready), 1.5s per message (1s typing + 0.5s hold).
//
// State machine:
//   typing  — logo fades 1→0 while 25 messages type in sequence
//   ready   — typing done + parent.ready=true; logo fades back to 1,
//             grows slightly, then pulses on a heartbeat loop. The user
//             is invited to tap anywhere to continue.
//   zooming — user tapped; logo dolly-zooms (scale 1.05 → 8) and
//             screen fades; onContinue fires after the animation lands.
//
// Tap during 'typing' skips straight to 'ready' so returning users
// aren't trapped in the 37.5s sequence.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";

const logo = require("../../../assets/images/logo-glow.png");

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

const TYPE_TARGET_MS = 1000;
const HOLD_MS = 500;
const PER_MESSAGE_MS = TYPE_TARGET_MS + HOLD_MS;
const TYPING_TOTAL_MS = MESSAGES.length * PER_MESSAGE_MS;

const ENTER_READY_MS = 500;   // logo fade-back + grow to 1.05
const PULSE_PERIOD_MS = 1400; // heartbeat half-cycle × 2
const ZOOM_MS = 800;          // dolly zoom duration

type Phase = "typing" | "ready" | "zooming";

interface Props {
  /** Parent's actual loading state — fonts, auth, etc. The screen
   *  won't advance to 'ready' until both the typing finishes AND this
   *  flag is true. Optional: when omitted, defaults to true. */
  ready?: boolean;
  /** Fires after the dolly-zoom animation completes. Parent unmounts. */
  onContinue?: () => void;
}

export function LoadingScreen({ ready = true, onContinue }: Props = {}) {
  const [phase, setPhase] = useState<Phase>("typing");
  const [msgIdx, setMsgIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [typingDone, setTypingDone] = useState(false);

  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;

  // ── typing sequence: fade logo opacity 1 → 0 in lockstep
  useEffect(() => {
    if (phase !== "typing") return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: TYPING_TOTAL_MS,
      useNativeDriver: true,
    }).start();
  }, [opacity, phase]);

  // ── per-message typewriter
  useEffect(() => {
    if (phase !== "typing") return;
    if (msgIdx >= MESSAGES.length) {
      setTypingDone(true);
      return;
    }
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
  }, [msgIdx, phase]);

  // ── transition typing → ready when both typing-done and parent.ready
  useEffect(() => {
    if (phase !== "typing") return;
    if (!typingDone || !ready) return;
    setPhase("ready");
    // Bring logo back, grow slightly, then start heartbeat loop.
    opacity.stopAnimation();
    scale.stopAnimation();
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_READY_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.05,
        duration: ENTER_READY_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(hintOpacity, {
        toValue: 1,
        duration: ENTER_READY_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Heartbeat — gentle, ~0.7Hz. Two-stage like a real pulse.
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.15, duration: PULSE_PERIOD_MS / 4, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.05, duration: PULSE_PERIOD_MS / 4, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.10, duration: PULSE_PERIOD_MS / 4, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.05, duration: PULSE_PERIOD_MS / 4, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ).start();
    });
  }, [phase, typingDone, ready, opacity, scale, hintOpacity]);

  function handlePress() {
    if (phase === "typing") {
      // Skip the rest of the typing sequence.
      setTypingDone(true);
      setMsgIdx(MESSAGES.length); // stop typewriter
      // The 'ready' effect will run on the next render if parent.ready=true.
      return;
    }
    if (phase !== "ready") return;
    setPhase("zooming");
    scale.stopAnimation();
    hintOpacity.stopAnimation();
    Animated.parallel([
      // Dolly zoom: logo grows ~7× to fill (and overflow) the viewport.
      Animated.timing(scale, {
        toValue: 8,
        duration: ZOOM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      // Hint fades out as the eye locks onto the logo.
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: ZOOM_MS * 0.4,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onContinue?.();
    });
  }

  return (
    <Pressable
      onPress={handlePress}
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel="2nd-Brain 불러오는 중"
    >
      <Animated.Image
        source={logo}
        style={[styles.logo, { opacity, transform: [{ scale }] }]}
        resizeMode="contain"
      />
      {phase === "typing" ? (
        <Text style={styles.text}>
          {typed}
          <Text style={styles.caret}>▍</Text>
        </Text>
      ) : null}
      {phase === "ready" ? (
        <Animated.Text style={[styles.hint, { opacity: hintOpacity }]}>
          탭해서 두번째 뇌를 열기
        </Animated.Text>
      ) : null}
    </Pressable>
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
  caret: { color: "#2F97FC", opacity: 0.8 },
  hint: {
    color: "#7FB3F4",
    fontSize: 13,
    letterSpacing: 2,
    textAlign: "center",
  },
});
