// LoadingScreen — phase-driven typewriter, adaptive timing, opacity FADE-OUT.
//
// 밤빛 조각마을이 깨어나는 동안 일꾼 세포들이 분주하다 (docs/DESIGN.md). 25
// messages across 5 build phases (밤하늘 → 마을 섬 → 길 → 나의 중심 → 환영),
// each ~1.5s — the cosmic pixel graph village, not a literal brain.
//
// Behavior:
//   - Logo starts at opacity 1 and fades OUT to 0 over MIN_INTRO_MS as
//     the typing messages take over. Per user convention: all opacity
//     transitions go 100% → 0%. The brain is being "absorbed into" the
//     cells' typed work.
//   - When ready hits, logo fades back to 1 + grows + pulses (must be
//     visible to invite the tap).
//   - Tap → dolly-zoom to scale 4 → onContinue. /index picks up the
//     same scale 4 + opacity 1 frame so the handoff is seamless.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text } from "react-native";

import { CosmicBackground } from "@/components/premium";
import { cosmic } from "@/lib/theme/tokens";

const logo = require("../../../public/assets/2ndb-production-premium-v1/graph/islands/core_center_premium_hq.png");

const MESSAGES: readonly string[] = [
  // Phase 1 — 밤하늘 (the cosmic night canvas)
  "밤하늘 펼치는 중...",
  "영차영차! 별가루 한 줌 뿌리는 중.",
  "우주 바닥 다 깔았다! 일꾼 세포 투입.",
  "읏차! 어둠에 첫 불빛 한 점 심는 중.",
  "마을 들어설 자리, 반짝반짝 닦는 중!",
  // Phase 2 — 마을 섬 (the floating district islands)
  "마을 섬 빚는 중...",
  "흙 한 줌 두 줌, 동네 땅 다지기.",
  "여섯 동네 기둥 세우는 중!",
  "바쁘다 바빠! 지붕에 픽셀 한 칸씩.",
  "섬이 둥실, 하늘 위로 띄우는 중.",
  // Phase 3 — 길 (the paths between villages)
  "마을과 마을, 길 잇는 중...",
  "쫙쫙! 빛나는 오솔길 늘이는 중.",
  "조각과 조각, 실 한 가닥씩 연결.",
  "찌릿! 끊긴 길 이어 붙이는 중.",
  "길 엉키지 않게 조심조심!",
  // Phase 4 — 나의 중심 (the center lights up)
  "나의 중심 불 켜는 중...",
  "탁! 마을 한가운데 등대 점등.",
  "사방 동네로 빛 보내는 중!",
  "쓱싹쓱싹, 중심 광장 대청소.",
  "마을 채비 막바지! 최종 점검.",
  // Phase 5 — 환영 (ready to welcome the first piece)
  "당신의 조각을 기다리는 중...",
  "안테나 쫙! 새 이야기 수신 대기.",
  "일꾼들 환영 채비 끝, 문 여는 중.",
  "꿀꺽. 첫 조각 받을 두 손 모으고 대기.",
  "두근두근! 당신의 멋진 생각, 기대 중!",
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
// Safety net: if the user never taps (or can't), auto-continue a few seconds
// after the ready phase so we never sit on the loader forever.
const AUTO_CONTINUE_MS = 4000;

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

  // Logo starts at opacity 1 and fades OUT during typing — the brain
  // "absorbs into" the cells' work. Comes back to 1 in the ready phase.
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;

  // Synchronous re-entry guard for the zoom. `phase` state is async, so a
  // user tap and the auto-continue timer can both read a stale "ready"
  // phase and each start a zoom (+ fire onContinue twice). This ref flips
  // true the instant either path begins.
  const zoomingRef = useRef(false);

  // ── min-intro gate
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  // ── logo opacity fades 1 → 0 over OPACITY_FADE_MS while the cells type.
  //    All opacity transitions follow the 100% → 0% direction per user
  //    convention. Returns to 1 when phase flips to ready.
  useEffect(() => {
    if (phase !== "typing") return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: OPACITY_FADE_MS,
      easing: Easing.in(Easing.cubic),
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

  // Auto-continue safety net: if we reach 'ready' and the user doesn't tap
  // within AUTO_CONTINUE_MS, advance anyway so we never strand on the loader.
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setTimeout(() => startZoom(), AUTO_CONTINUE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  function startZoom() {
    if (zoomingRef.current) return;
    zoomingRef.current = true;
    setPhase("zooming");
    scale.stopAnimation();
    hintOpacity.stopAnimation();
    Animated.parallel([
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

  function handlePress() {
    if (phase === "typing") {
      // Skip path: assume ready by forcing minElapsed (parent.ready
      // might still be false but most tap-skips are warm reloads).
      setMinElapsed(true);
      return;
    }
    if (phase !== "ready") return;
    // Dolly zoom ends at scale 4 — matches /index's entry initial scale so
    // the loading→main handoff has no size jump. /index then settles to
    // scale 1.6 + opacity 0.4 over 750ms. Routed through the shared
    // startZoom() so the tap and the auto-continue timer share one guard.
    startZoom();
  }

  const accessibilityLabel =
    phase === "ready" ? "2nd-Brain 열기" : phase === "zooming" ? "2nd-Brain 여는 중" : "2nd-Brain 불러오는 중";
  const accessibilityHint =
    phase === "ready" ? "두 번 탭하면 메인 화면으로 이동합니다." : "두 번 탭하면 시작 애니메이션을 건너뜁니다.";

  return (
    <Pressable
      onPress={handlePress}
      disabled={phase === "zooming"}
      style={styles.root}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: phase !== "ready", disabled: phase === "zooming" }}
    >
      <CosmicBackground />
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
    backgroundColor: cosmic.space950,
    gap: 32,
  },
  logo: { width: 220, height: 220 },
  text: {
    color: cosmic.moonWhite,
    fontSize: 15,
    letterSpacing: 0,
    minHeight: 22,
  },
  caret: { color: cosmic.signalMint, opacity: 0.85 },
  hint: {
    color: cosmic.soulViolet,
    fontSize: 13,
    letterSpacing: 0,
    textAlign: "center",
  },
});
