// LoadingScreen: deterministic 48-step HustleK opening.
//
// The approved full-body walk and turn/contact pixels live in one compact
// atlas. Frame changes are integer cuts at 80 ms: there is no pose tween,
// per-frame scaling, or duplicated telescope baked into character cells.

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useTranslation } from "react-i18next";

import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { deepSpace, typography } from "@/lib/theme/tokens";

const openingAtlas = require("../../../assets/deepspace/hustlek-opening-v2.png");

const FRAME_MS = 80;
const LAST_MEANINGFUL_FRAME = 44;
const STORY_END_MS = (LAST_MEANINGFUL_FRAME + 1) * FRAME_MS;
const EXIT_FIRST_FRAME = 45;
const LAST_FRAME = 47;
const EXIT_DURATION_MS = (LAST_FRAME - EXIT_FIRST_FRAME + 1) * FRAME_MS;
const AUTO_CONTINUE_MS = 4_000;
const AUTO_EXIT_START_MS = AUTO_CONTINUE_MS - EXIT_DURATION_MS;
const HARD_READY_MS = 9_000;

const ATLAS_WIDTH = 576;
const ATLAS_HEIGHT = 416;
const CHARACTER_CELL = 96;
const TELESCOPE_CELL = 128;
const STAGE_WIDTH = 320;
const STAGE_HEIGHT = 260;
const NORTH_X = STAGE_WIDTH / 2;
const GROUND_Y = 220;
const CHARACTER_FLOOR = 94;
const TELESCOPE_FLOOR = 124;

const WALK_CENTERS = [-32, -22, -10, 4, 20, 38, 58, 80, 102, 122, 138, 150, 158, 160] as const;
const TURN_KEYS = [0, 1, 1, 2, 2, 3, 4, 5] as const;
const PAN_CAMERA_TOP = [-64, -48, -28, -4, 24, 48, 72, 96] as const;
const POLARIS_PING = [12, 16, 20, 16, 12] as const;

const SKY_STARS = [
  [20, 30, 2],
  [48, 84, 2],
  [74, 22, 3],
  [104, 112, 2],
  [134, 58, 2],
  [190, 28, 2],
  [220, 98, 3],
  [250, 48, 2],
  [286, 118, 2],
  [302, 72, 2],
] as const;

export type OpeningPhase = "story" | "waiting-ready" | "ready" | "exiting" | "done";

export interface OpeningPlan {
  frame: number;
  phase: OpeningPhase;
  shouldContinue: boolean;
}

interface OpeningStateInput {
  elapsedMs: number;
  readyAtMs: number | null;
  tapAtMs: number | null;
  reducedMotion: boolean;
}

export function openingStateAt({
  elapsedMs,
  readyAtMs,
  tapAtMs,
  reducedMotion,
}: OpeningStateInput): OpeningPlan {
  const elapsed = Math.max(0, Math.floor(elapsedMs));
  const effectiveReadyAt = readyAtMs ?? HARD_READY_MS;

  if (reducedMotion) {
    const requestedAt = tapAtMs ?? AUTO_CONTINUE_MS;
    const continueAt = Math.max(effectiveReadyAt, requestedAt);
    if (elapsed >= continueAt) {
      return { frame: LAST_MEANINGFUL_FRAME, phase: "done", shouldContinue: true };
    }
    return {
      frame: LAST_MEANINGFUL_FRAME,
      phase: elapsed < effectiveReadyAt ? "waiting-ready" : "ready",
      shouldContinue: false,
    };
  }

  if (elapsed < STORY_END_MS) {
    return {
      frame: Math.min(Math.floor(elapsed / FRAME_MS), LAST_MEANINGFUL_FRAME),
      phase: "story",
      shouldContinue: false,
    };
  }

  if (elapsed < effectiveReadyAt) {
    return { frame: LAST_MEANINGFUL_FRAME, phase: "waiting-ready", shouldContinue: false };
  }

  const requestedAt = tapAtMs ?? AUTO_EXIT_START_MS;
  const exitAt = Math.max(STORY_END_MS, effectiveReadyAt, requestedAt);
  if (elapsed < exitAt) {
    return { frame: LAST_MEANINGFUL_FRAME, phase: "ready", shouldContinue: false };
  }

  const exitElapsed = elapsed - exitAt;
  if (exitElapsed >= EXIT_DURATION_MS) {
    return { frame: LAST_FRAME, phase: "done", shouldContinue: true };
  }
  return {
    frame: EXIT_FIRST_FRAME + Math.floor(exitElapsed / FRAME_MS),
    phase: "exiting",
    shouldContinue: false,
  };
}

type CharacterPlan =
  | { kind: "walk"; index: number; centerX: number }
  | { kind: "key"; index: number; centerX: number };

export interface OpeningScenePlan {
  character: CharacterPlan | null;
  cameraTop: number;
  polarisSize: number;
  veilHeight: number;
}

export function openingSceneForFrame(frameInput: number): OpeningScenePlan {
  const frame = Math.max(0, Math.min(LAST_FRAME, Math.floor(frameInput)));
  let character: CharacterPlan | null = null;
  if (frame >= 4 && frame <= 17) {
    const walkStep = frame - 4;
    character = {
      kind: "walk",
      index: walkStep % 12,
      centerX: WALK_CENTERS[walkStep],
    };
  } else if (frame >= 18) {
    const keyIndex = frame <= 25 ? TURN_KEYS[frame - 18] : 5;
    character = { kind: "key", index: keyIndex, centerX: NORTH_X };
  }

  const cameraTop =
    frame < 32 ? PAN_CAMERA_TOP[0] : frame <= 39 ? PAN_CAMERA_TOP[frame - 32] : PAN_CAMERA_TOP[7];
  const polarisSize = frame >= 40 && frame <= 44 ? POLARIS_PING[frame - 40] : POLARIS_PING[0];
  const veilHeight =
    frame === 0
      ? STAGE_HEIGHT
      : frame === 1
        ? 174
        : frame === 2
          ? 86
          : frame === 45
            ? 86
            : frame === 46
              ? 174
              : frame >= 47
                ? STAGE_HEIGHT
                : 0;
  return { character, cameraTop, polarisSize, veilHeight };
}

interface AtlasCellProps {
  sourceX: number;
  sourceY: number;
  size: number;
  style: ViewStyle;
}

function AtlasCell({ sourceX, sourceY, size, style }: AtlasCellProps) {
  return (
    <View pointerEvents="none" style={[styles.atlasClip, style, { width: size, height: size }]}>
      <ExpoImage
        source={openingAtlas}
        style={[styles.atlasImage, { left: -sourceX, top: -sourceY }]}
        contentFit="fill"
        cachePolicy="memory"
        priority="high"
      />
    </View>
  );
}

function CharacterCell({ plan }: { plan: CharacterPlan }) {
  const sourceX = (plan.index % 6) * CHARACTER_CELL;
  const sourceY = plan.kind === "walk" ? Math.floor(plan.index / 6) * CHARACTER_CELL : CHARACTER_CELL * 2;
  return (
    <AtlasCell
      sourceX={sourceX}
      sourceY={sourceY}
      size={CHARACTER_CELL}
      style={{
        left: plan.centerX - CHARACTER_CELL / 2,
        top: GROUND_Y - CHARACTER_FLOOR,
      }}
    />
  );
}

function Polaris({ size }: { size: number }) {
  const thickness = 4;
  const inset = Math.floor((size - thickness) / 2);
  return (
    <View pointerEvents="none" style={[styles.polaris, { width: size, height: size, left: NORTH_X - size / 2 }]}>
      <View style={[styles.polarisOuter, { left: 0, top: inset, width: size, height: thickness }]} />
      <View style={[styles.polarisOuter, { left: inset, top: 0, width: thickness, height: size }]} />
      <View style={[styles.polarisCore, { left: inset, top: inset, width: thickness, height: thickness }]} />
    </View>
  );
}

function OpeningStage({ frame }: { frame: number }) {
  const scene = openingSceneForFrame(frame);
  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.skyTop} />
      <View style={styles.skyMiddle} />
      <View style={styles.skyBottom} />
      {SKY_STARS.map(([left, top, size]) => (
        <View key={`${left}-${top}`} style={[styles.skyStar, { left, top, width: size, height: size }]} />
      ))}

      <View pointerEvents="none" style={[styles.world, { top: scene.cameraTop }]}>
        <Polaris size={scene.polarisSize} />
        <View style={styles.groundLine} />
        <View style={styles.groundBand} />
        <AtlasCell
          sourceX={0}
          sourceY={CHARACTER_CELL * 3}
          size={TELESCOPE_CELL}
          style={{ left: NORTH_X - TELESCOPE_CELL / 2, top: GROUND_Y - TELESCOPE_FLOOR }}
        />
        {scene.character ? <CharacterCell plan={scene.character} /> : null}
      </View>

      {scene.veilHeight > 0 ? <View style={[styles.veil, { height: scene.veilHeight }]} /> : null}
    </View>
  );
}

interface Props {
  ready?: boolean;
  onContinue?: () => void;
}

export function LoadingScreen({ ready = true, onContinue }: Props = {}) {
  const { t } = useTranslation("common");
  const reducedMotion = useReducedMotionPref();
  const startedAt = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const continuedRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [readyAtMs, setReadyAtMs] = useState<number | null>(ready ? 0 : null);
  const [tapAtMs, setTapAtMs] = useState<number | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current);
    }, FRAME_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || readyAtMs !== null) return;
    setReadyAtMs(Date.now() - startedAt.current);
  }, [ready, readyAtMs]);

  const plan = openingStateAt({ elapsedMs, readyAtMs, tapAtMs, reducedMotion });
  const phase: "typing" | "ready" | "zooming" =
    plan.phase === "ready" ? "ready" : plan.phase === "exiting" || plan.phase === "done" ? "zooming" : "typing";

  useEffect(() => {
    if (!plan.shouldContinue || continuedRef.current) return;
    continuedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    onContinue?.();
  }, [onContinue, plan.shouldContinue]);

  function handlePress() {
    if (phase === "zooming" || tapAtMs !== null) return;
    setTapAtMs(Date.now() - startedAt.current);
  }

  const accessibilityLabel =
    phase === "ready" ? t("loadingGate.open") : phase === "zooming" ? t("loadingGate.opening") : t("loadingGate.loading");
  const accessibilityHint = phase === "ready" ? t("loadingGate.enterHint") : t("loadingGate.skipHint");

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
      <OpeningStage frame={plan.frame} />
      {phase === "ready" ? <Text style={styles.hint}>{t("loadingGate.hint")}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: deepSpace.bgEdge,
    gap: 16,
  },
  stage: {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    overflow: "hidden",
    backgroundColor: deepSpace.bgEdge,
  },
  skyTop: {
    position: "absolute",
    left: 0,
    top: 0,
    width: STAGE_WIDTH,
    height: 88,
    backgroundColor: deepSpace.bgGlow,
  },
  skyMiddle: {
    position: "absolute",
    left: 0,
    top: 88,
    width: STAGE_WIDTH,
    height: 88,
    backgroundColor: deepSpace.bgMid,
  },
  skyBottom: {
    position: "absolute",
    left: 0,
    top: 176,
    width: STAGE_WIDTH,
    height: 84,
    backgroundColor: deepSpace.bgEdge,
  },
  skyStar: {
    position: "absolute",
    backgroundColor: deepSpace.accentDim,
  },
  world: {
    position: "absolute",
    left: 0,
    width: STAGE_WIDTH,
    height: 360,
  },
  groundLine: {
    position: "absolute",
    left: 0,
    top: GROUND_Y,
    width: STAGE_WIDTH,
    height: 4,
    backgroundColor: deepSpace.accentGlow,
  },
  groundBand: {
    position: "absolute",
    left: 0,
    top: GROUND_Y + 4,
    width: STAGE_WIDTH,
    height: 136,
    backgroundColor: deepSpace.bgMid,
  },
  atlasClip: {
    position: "absolute",
    overflow: "hidden",
  },
  atlasImage: {
    position: "absolute",
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
  },
  polaris: {
    position: "absolute",
    top: 20,
  },
  polarisOuter: {
    position: "absolute",
    backgroundColor: deepSpace.soulDeep,
  },
  polarisCore: {
    position: "absolute",
    backgroundColor: deepSpace.soul,
  },
  veil: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: STAGE_WIDTH,
    backgroundColor: deepSpace.bgEdge,
  },
  hint: {
    color: deepSpace.textHi,
    fontSize: typography.sizes.sm,
    textAlign: "center",
    lineHeight: 20,
    paddingBottom: 2,
  },
});
