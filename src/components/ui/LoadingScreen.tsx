// LoadingScreen — phase-driven typewriter + logo opacity fade.
//
// Design refactor step 1 (per dialogue). Self-contained: no provider
// or font dependency, so it renders both during _layout font load
// and during in-screen auth resolution.
//
// Behavior:
//   - Dark sky-black background (#02040A).
//   - logo-glow.png centered, opacity animates 1 → 0 over TOTAL_MS.
//   - Five sequential "forming the brain" phases (1s each), each with
//     a per-character typewriter that fast-types the phase label
//     left-to-right.
//   - No spinner — the logo fade + typewriter ARE the progress signal.
//
// The legacy version is preserved in LoadingScreen.legacy.tsx in case
// we need to revert.

import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

// Logo with glow — resolves to the root assets/ dir.
const logo = require("../../../assets/images/logo-glow.png");

interface Phase {
  /** progress (0..100) at which this phase begins */
  from: number;
  /** progress (0..100) at which this phase ends */
  to: number;
  text: string;
}

const PHASES: readonly Phase[] = [
  { from: 0, to: 20, text: "Soma 형성 중..." },
  { from: 20, to: 40, text: "Neuron 형성 중..." },
  { from: 40, to: 60, text: "Cortex 형성 중..." },
  { from: 60, to: 80, text: "Cerebrum 형성 중..." },
  { from: 80, to: 100, text: "사용자의 생각을 받아들일 준비 중..." },
] as const;

// Total run time for the 5 phases. Each phase = TOTAL_MS / 5 = 1000ms.
const TOTAL_MS = 5000;
// Per-character typing speed. Fast: the user said '빠른 속도로 한글자씩'.
const TYPE_INTERVAL_MS = 35;
// Tick rate for progress (smooth enough for the eye, cheap on CPU).
const PROGRESS_TICK_MS = 50;

function pickPhase(progress: number): Phase {
  for (const p of PHASES) {
    if (progress >= p.from && progress < p.to) return p;
  }
  return PHASES[PHASES.length - 1];
}

export function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [typed, setTyped] = useState("");
  const opacity = useRef(new Animated.Value(1)).current;

  // Drive progress 0 → 100 over TOTAL_MS.
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / TOTAL_MS) * 100);
      setProgress(p);
      if (p >= 100) clearInterval(id);
    }, PROGRESS_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Fade logo opacity 1 → 0 over TOTAL_MS, in lockstep with the typewriter.
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: TOTAL_MS,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const phase = pickPhase(progress);

  // Typewriter: reset on phase change, then type one char at a time.
  useEffect(() => {
    setTyped("");
    const target = phase.text;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(target.slice(0, i));
      if (i >= target.length) clearInterval(id);
    }, TYPE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase.text]);

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
    fontVariant: ["tabular-nums"],
    minHeight: 22,
  },
  caret: {
    color: "#2F97FC",
    opacity: 0.8,
  },
});
