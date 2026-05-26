// LoadingScreen — phase-driven typewriter, adaptive timing, opacity FADE-IN.
//
// "내 머릿속의 열일하는 세포들" (docs/DESIGN.md). 25 messages across 5
// build phases (Soma → Neuron → Cortex → Cerebrum → Ready), each ~1.5s.
//
// Behavior:
//   - Logo starts at opacity 0 (invisible) and fades IN to 1 as the
//     "brain forms" via the typing messages. Reversed from v1 per user
//     directive ("로고의 불투명도 변화가 반대로 설정 됐어").
//   - Adaptive duration: the intro keeps typing until parent.ready=true,
//     with a MIN_INTRO_MS guard so users always see at least the first
//     few messages even when the app is cached and ready instantly.
//   - After parent.ready AND min-time elapsed, transition to 'ready':
//     logo grows to scale 1.05 and pulses on a heartbeat loop.
//   - Tap during typing: skips straight to ready (returning users).
//   - Tap during ready: dolly-zoom (scale 1.05 → 8) + onContinue fires.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";

const logo = require("../../../assets/images/logo-glow.png");

const MESSAGES: readonly string[] = [
  // Phase 1 — Soma
  "Soma 형성 중...",
  "영차영차! 단백질 블록 운반 중.",
  "자재 반입 완료! 일꾼 세포 투입.",
  "읏차! 튼튼한 코어 빚는 중.",
  "세포 조립 라인 풀가동!",
  // Phase 2 — Neuron
  "Neuron 형성 중...",
  "쫙쫙! 축삭돌기 연장 중.",
  "찌릿! 통신 케이블 연결.",
  "바쁘다 바빠! 시냅스 땜질 중.",
  "신경 회로 엉키지 않게 조심조심!",
  // Phase 3 — Cortex
  "Cortex 형성 중...",
  "꾹꾹! 뇌 주름 접는 중.",
  "표면적을 넓혀라! 세포들 뜀박질.",
  "고급 정보 구역 뼈대 세우기.",
  "차곡차곡! 빈틈없이 피질 쌓기.",
  // Phase 4 — Cerebrum
  "Cerebrum 형성 중...",
  "탁! 메인 컨트롤 룸 점등.",
  "좌우뇌 통신 완료! 중앙 다리 연결.",
  "쓱싹쓱싹, 지휘소 대청소 중.",
  "뇌 조립 막바지! 최종 점검.",
  // Phase 5 — Ready
  "사용자의 생각을 받아들일 준비 중...",
  "수신 안테나 쫙! 아이디어 대기.",
  "신경망 스탠바이! 환영 게이트 개방.",
  "꿀꺽. 일꾼들 긴장하며 대기 선 열쇠.",
  "두근두근! 멋진 생각 기대 중!",
] as const;

// Minimum time the intro plays before we'll allow the ready transition
// — guards instant warm-loads where parent.ready fires in <100ms. 2.5s
// = enough to see the first 1-2 messages.
const MIN_INTRO_MS = 2500;
// Per-message slot in the typing animation: 1s typing + 0.5s hold.
const TYPE_TARGET_MS = 1000;
const HOLD_MS = 500;
const PER_MESSAGE_MS = TYPE_TARGET_MS + HOLD_MS;
// Logo fade-in spans the minimum-intro window so it always lands at 1
// before we even consider going to ready. After that it stays at 1.
const OPACITY_FADE_MS = MIN_INTRO_MS;

const ENTER_READY_MS = 400;    // grow to 1.05 when entering ready
const PULSE_PERIOD_MS = 1400;  // heartbeat full cycle
const ZOOM_MS = 800;           // dolly-zoom on tap

type Phase = "typing" | "ready" | "zooming";

interface Props {
  /** Parent's actual loading state — fonts, auth, etc. The screen
   *  won't advance to 'ready' until both this flag is true AND
   *  MIN_INTRO_MS has elapsed. Optional: defaults to true. */
  ready?: boolean;
  /** Fires after the dolly-zoom completes. Parent unmounts. */
  onContinue?: () => void;
}

export function LoadingScreen({ ready = true, onContinue }: Props = {}) {
  const [phase, setPhase] = useState<Phase>("typing");
  const [msgIdx, setMsgIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [minElapsed, setMinElapsed] = useState(false);

  // Logo starts invisible and fades IN — the brain "appears" as cells form.
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;

  // ── min-intro gate
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  // ── logo opacity fades 0 → 1 over MIN_INTRO_MS, then holds at 1
  useEffect(() => {
    if (phase !== "typing") return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: OPACITY_FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [opacity, phase]);

  // ── per-message typewriter — advances until parent.ready & minElapsed
  //    push us into the 'ready' phase below.
  useEffect(() => {
    if (phase !== "typing") return;
    if (msgIdx >= MESSAGES.length) return; // last message stays
    const text = MESSAGES[msgIdx];
    setTyped("");

    let i = 0;
    const typeId = setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) clearInterval(typeId);
    }, Math.max(20, TYPE_TARGET_MS / text.length));

    const advanceId = setTimeout(() => {
      setMsgIdx((idx) => Math.min(idx + 1, MESSAGES.length - 1));
    }, PER_MESSAGE_MS);

    return () => {
      clearInterval(typeId);
      clearTimeout(advanceId);
    };
  }, [msgIdx, phase]);

  // ── transition typing → ready when parent says ready AND min-time elapsed.
  //    No more "wait for typing to finish" — the intro adapts to actual
  //    loading speed per user directive (실제 로딩되는 속도에 맞게).
  useEffect(() => {
    if (phase !== "typing") return;
    if (!ready || !minElapsed) return;
    setPhase("ready");
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
      // Heartbeat — gentle, two-stage pulse.
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.15, duration: PULSE_PERIOD_MS / 4, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.05, duration: PULSE_PERIOD_MS / 4, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.10, duration: PULSE_PERIOD_MS / 4, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.05, duration: PULSE_PERIOD_MS / 4, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ).start();
    });
  }, [phase, ready, minElapsed, opacity, scale, hintOpacity]);

  function handlePress() {
    if (phase === "typing") {
      // Skip path: assume ready by forcing minElapsed (parent.ready
      // might still be false but most tap-skips are warm reloads).
      setMinElapsed(true);
      return;
    }
    if (phase !== "ready") return;
    setPhase("zooming");
    scale.stopAnimation();
    hintOpacity.stopAnimation();
    Animated.parallel([
      // Dolly zoom ends at scale 4 — matches /index's entry initial
      // scale so the loading→main handoff has no size jump. /index then
      // settles to scale 1.6 + opacity 0.4 over 750ms.
      Animated.timing(scale, {
        toValue: 4,
        duration: ZOOM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
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
