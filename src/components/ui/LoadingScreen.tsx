// LoadingScreen: deterministic 48-step HustleK opening.
//
// Approved v1 pixels are stored as compact, binary-alpha integer rectangles.
// Every source unit maps to an integer number of physical pixels and every
// pose change is a hard 80 ms cut. No bitmap sampler, pose tween, blur, or
// duplicated telescope participates in the runtime.

import { useEffect, useRef, useState } from "react";
import {
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Rect, Svg } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { deepSpace, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

type RectRun = [palette: number, x: number, y: number, width: number, height: number];
type RleAtlas = {
  v: 2;
  u: 1;
  p: string[];
  w: RectRun[][];
  k: RectRun[][];
  t: RectRun[];
};

const openingAtlas = require("../../../assets/deepspace/hustlek-opening-v2.json") as RleAtlas;

const FRAME_MS = 80;
const LAST_MEANINGFUL_FRAME = 44;
const STORY_END_MS = (LAST_MEANINGFUL_FRAME + 1) * FRAME_MS;
const EXIT_FIRST_FRAME = 45;
const LAST_FRAME = 47;
const EXIT_DURATION_MS = (LAST_FRAME - EXIT_FIRST_FRAME + 1) * FRAME_MS;
const AUTO_CONTINUE_MS = 4_000;
const AUTO_EXIT_START_MS = AUTO_CONTINUE_MS - EXIT_DURATION_MS;
const HARD_READY_MS = 9_000;

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

export function pixelUnitScale(pixelRatio: number): number {
  const safeRatio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const physicalPixelsPerUnit = Math.max(1, Math.floor(safeRatio + Number.EPSILON));
  return physicalPixelsPerUnit / safeRatio;
}

export function createOpeningTicker(
  startedAtMs: number,
  onTick: (elapsedMs: number) => void,
): () => void {
  const timer = setInterval(() => onTick(Date.now() - startedAtMs), FRAME_MS);
  return () => clearInterval(timer);
}

export function deliverContinueOnce(
  gate: { current: boolean },
  onContinue?: () => void,
): void {
  if (gate.current) return;
  gate.current = true;
  onContinue?.();
}

interface RleCellProps {
  rects: RectRun[];
  width: number;
  height: number;
  style?: ViewStyle;
}

export function RleCell({ rects, width, height, style }: RleCellProps) {
  const unit = pixelUnitScale(PixelRatio.get());
  const crispProps = Platform.OS === "web" ? { shapeRendering: "crispEdges" as const } : {};

  return (
    <View
      pointerEvents="none"
      style={[styles.rleCell, style, { width: width * unit, height: height * unit }]}
    >
      <Svg
        {...crispProps}
        width={width * unit}
        height={height * unit}
        viewBox={"0 0 " + width + " " + height}
      >
        {rects.map(([band, x, y, rectWidth, rectHeight], index) => (
          <Rect
            key={index}
            x={x}
            y={y}
            width={rectWidth}
            height={rectHeight}
            fill={openingAtlas.p[band]}
          />
        ))}
      </Svg>
    </View>
  );
}

function CharacterCell({ plan, unit }: { plan: CharacterPlan; unit: number }) {
  const rects = plan.kind === "walk" ? openingAtlas.w[plan.index] : openingAtlas.k[plan.index];
  return (
    <RleCell
      rects={rects}
      width={CHARACTER_CELL}
      height={CHARACTER_CELL}
      style={{
        left: (plan.centerX - CHARACTER_CELL / 2) * unit,
        top: (GROUND_Y - CHARACTER_FLOOR) * unit,
      }}
    />
  );
}

function Polaris({ size, unit }: { size: number; unit: number }) {
  const thickness = 4;
  const inset = Math.floor((size - thickness) / 2);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.polaris,
        {
          width: size * unit,
          height: size * unit,
          left: (NORTH_X - size / 2) * unit,
          top: 20 * unit,
        },
      ]}
    >
      <View style={[styles.polarisOuter, { left: 0, top: inset * unit, width: size * unit, height: thickness * unit }]} />
      <View style={[styles.polarisOuter, { left: inset * unit, top: 0, width: thickness * unit, height: size * unit }]} />
      <View
        style={[
          styles.polarisCore,
          { left: inset * unit, top: inset * unit, width: thickness * unit, height: thickness * unit },
        ]}
      />
    </View>
  );
}

function OpeningStage({ frame }: { frame: number }) {
  const scene = openingSceneForFrame(frame);
  const unit = pixelUnitScale(PixelRatio.get());

  return (
    <View
      style={[styles.stage, { width: STAGE_WIDTH * unit, height: STAGE_HEIGHT * unit }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.skyTop, { width: STAGE_WIDTH * unit, height: 88 * unit }]} />
      <View style={[styles.skyMiddle, { top: 88 * unit, width: STAGE_WIDTH * unit, height: 88 * unit }]} />
      <View style={[styles.skyBottom, { top: 176 * unit, width: STAGE_WIDTH * unit, height: 84 * unit }]} />
      {SKY_STARS.map(([left, top, size]) => (
        <View
          key={left + "-" + top}
          style={[
            styles.skyStar,
            { left: left * unit, top: top * unit, width: size * unit, height: size * unit },
          ]}
        />
      ))}

      <View
        pointerEvents="none"
        style={[
          styles.world,
          { top: scene.cameraTop * unit, width: STAGE_WIDTH * unit, height: 360 * unit },
        ]}
      >
        <Polaris size={scene.polarisSize} unit={unit} />
        <View
          style={[
            styles.groundLine,
            { top: GROUND_Y * unit, width: STAGE_WIDTH * unit, height: 4 * unit },
          ]}
        />
        <View
          style={[
            styles.groundBand,
            { top: (GROUND_Y + 4) * unit, width: STAGE_WIDTH * unit, height: 136 * unit },
          ]}
        />
        <RleCell
          rects={openingAtlas.t}
          width={TELESCOPE_CELL}
          height={TELESCOPE_CELL}
          style={{
            left: (NORTH_X - TELESCOPE_CELL / 2) * unit,
            top: (GROUND_Y - TELESCOPE_FLOOR) * unit,
          }}
        />
        {scene.character ? <CharacterCell plan={scene.character} unit={unit} /> : null}
      </View>

      {scene.veilHeight > 0 ? (
        <View
          style={[
            styles.veil,
            { width: STAGE_WIDTH * unit, height: scene.veilHeight * unit },
          ]}
        />
      ) : null}
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
  const stopTickerRef = useRef<(() => void) | null>(null);
  const continuedRef = useRef(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [readyAtMs, setReadyAtMs] = useState<number | null>(ready ? 0 : null);
  const [tapAtMs, setTapAtMs] = useState<number | null>(null);

  useEffect(() => {
    const stop = createOpeningTicker(startedAt.current, setElapsedMs);
    stopTickerRef.current = stop;
    return () => {
      stop();
      if (stopTickerRef.current === stop) stopTickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || readyAtMs !== null) return;
    setReadyAtMs(Date.now() - startedAt.current);
  }, [ready, readyAtMs]);

  const plan = openingStateAt({ elapsedMs, readyAtMs, tapAtMs, reducedMotion });

  useEffect(() => {
    if (!plan.shouldContinue) return;
    stopTickerRef.current?.();
    stopTickerRef.current = null;
    deliverContinueOnce(continuedRef, onContinue);
  }, [onContinue, plan.shouldContinue]);

  function handlePress() {
    if (plan.phase === "exiting" || plan.phase === "done" || tapAtMs !== null) return;
    setTapAtMs(Date.now() - startedAt.current);
  }

  const accessibilityLabel =
    plan.phase === "ready"
      ? t("loadingGate.open")
      : plan.phase === "exiting" || plan.phase === "done"
        ? t("loadingGate.opening")
        : t("loadingGate.loading");
  const accessibilityHint = plan.phase === "ready" ? t("loadingGate.enterHint") : undefined;

  return (
    <Pressable
      testID="loading-screen"
      style={styles.container}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        busy: plan.phase === "story" || plan.phase === "waiting-ready",
        disabled: plan.phase === "exiting" || plan.phase === "done",
      }}
    >
      <OpeningStage frame={plan.frame} />
      {plan.phase === "ready" ? <Text style={styles.hint}>{t("loadingGate.hint")}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: deepSpace.bgEdge,
  },
  stage: {
    overflow: "hidden",
    backgroundColor: deepSpace.bgEdge,
  },
  skyTop: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: deepSpace.bgGlow,
  },
  skyMiddle: {
    position: "absolute",
    left: 0,
    backgroundColor: deepSpace.bgMid,
  },
  skyBottom: {
    position: "absolute",
    left: 0,
    backgroundColor: deepSpace.bgEdge,
  },
  skyStar: {
    position: "absolute",
    backgroundColor: deepSpace.accentDim,
  },
  world: {
    position: "absolute",
    left: 0,
  },
  groundLine: {
    position: "absolute",
    left: 0,
    backgroundColor: deepSpace.accentGlow,
  },
  groundBand: {
    position: "absolute",
    left: 0,
    backgroundColor: deepSpace.bgMid,
  },
  rleCell: {
    position: "absolute",
  },
  polaris: {
    position: "absolute",
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
    backgroundColor: deepSpace.bgEdge,
  },
  hint: {
    color: deepSpace.textHi,
    fontFamily: fontFamilies.pixelKo,
    fontSize: typography.sizes.xs,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 16,
    paddingBottom: 2,
  },
});
