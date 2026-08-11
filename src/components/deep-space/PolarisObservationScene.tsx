import { Image } from "expo-image";
import React, { useCallback, useEffect } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageStyle,
} from "react-native";
import ReAnimated, {
  Easing as ReEasing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { deepSpace } from "@/lib/theme/tokens";

const BACKGROUND = require("../../../assets/images/polaris-observation-bg.png");
const ATLAS = require("../../../assets/images/polaris-observation-atlas.png");

export const POLARIS_OBSERVATION_DURATION_MS = 13_200;

export type PolarisObservationPhase =
  | "fade-in"
  | "establish"
  | "enter"
  | "setup"
  | "observe"
  | "focus"
  | "flash"
  | "fade-out";

export function getPolarisObservationPhase(timeMs: number): PolarisObservationPhase {
  if (timeMs < 800) return "fade-in";
  if (timeMs < 2_200) return "establish";
  if (timeMs < 4_800) return "enter";
  if (timeMs < 7_200) return "setup";
  if (timeMs < 9_000) return "observe";
  if (timeMs < 11_600) return "focus";
  if (timeMs < 12_300) return "flash";
  return "fade-out";
}

const SCENE_WIDTH = 320;
const SCENE_HEIGHT = 180;
const ATLAS_WIDTH = 352;
const ATLAS_HEIGHT = 160;
const FRAME_WIDTH = 64;
const FRAME_HEIGHT = 80;
const INTERACTION_ROW_Y = 80;
const TELESCOPE_X = 256;
const STAR_X = 320;
const STAR_Y = 24;
const STAR_SIZE = 32;
const PIXELATED = Platform.select({
  web: { imageRendering: "pixelated" } as unknown as ImageStyle,
  default: {} as ImageStyle,
});

interface SceneProps {
  loop?: boolean;
}

interface AtlasCropProps {
  scale: number;
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
}

function AtlasCrop({ scale, sourceX, sourceY, width, height }: AtlasCropProps) {
  return (
    <View style={{ width: width * scale, height: height * scale, overflow: "hidden" }}>
      <Image
        source={ATLAS}
        contentFit="fill"
        cachePolicy="memory-disk"
        style={[
          PIXELATED,
          {
            position: "absolute",
            left: -sourceX * scale,
            top: -sourceY * scale,
            width: ATLAS_WIDTH * scale,
            height: ATLAS_HEIGHT * scale,
          },
        ]}
      />
    </View>
  );
}

/**
 * Dev-tunable, asset-composed cutscene. It deliberately uses one UI-thread
 * clock so character frames, camera movement, fades, and the Polaris flash
 * cannot drift apart. Production can mount the same component as a home
 * overlay after the preview timing is approved.
 */
export function PolarisObservationScene({ loop = false }: SceneProps) {
  const reducedMotion = useReducedMotionPref();
  const { width, height } = useWindowDimensions();
  const stageWidth = Math.min(width, (height * SCENE_WIDTH) / SCENE_HEIGHT);
  const stageHeight = (stageWidth * SCENE_HEIGHT) / SCENE_WIDTH;
  const scale = stageWidth / SCENE_WIDTH;
  const clock = useSharedValue(0);

  const play = useCallback(() => {
    cancelAnimation(clock);
    clock.value = 0;
    const animation = withTiming(POLARIS_OBSERVATION_DURATION_MS, {
      duration: reducedMotion ? 4_200 : POLARIS_OBSERVATION_DURATION_MS,
      easing: ReEasing.linear,
    });
    clock.value = loop ? withRepeat(animation, -1, false) : animation;
  }, [clock, loop, reducedMotion]);

  useEffect(() => {
    play();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") play();
      else cancelAnimation(clock);
    });
    return () => {
      subscription.remove();
      cancelAnimation(clock);
    };
  }, [clock, play]);

  const walkFrame = useDerivedValue(() => {
    if (reducedMotion) return 0;
    return Math.floor(Math.max(0, clock.value - 2_200) / 190) % 4;
  });
  const interactionFrame = useDerivedValue(() => {
    if (reducedMotion) return 4;
    const t = clock.value;
    if (t < 5_500) return 0;
    if (t < 6_300) return 1;
    if (t < 7_100) return 2;
    if (t < 7_900) return 3;
    return 4;
  });

  const worldStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { transform: [{ translateX: 0 }, { translateY: 0 }] };
    const x = interpolate(clock.value, [9_000, 11_600], [0, -85 * scale], Extrapolation.CLAMP);
    const y = interpolate(clock.value, [9_000, 11_600], [0, 63 * scale], Extrapolation.CLAMP);
    return { transform: [{ translateX: Math.round(x) }, { translateY: Math.round(y) }] };
  });
  const walkingStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 0, transform: [{ translateX: 126 * scale }] };
    const x = interpolate(clock.value, [2_200, 4_800], [-64 * scale, 126 * scale], Extrapolation.CLAMP);
    const opacity = interpolate(clock.value, [2_150, 2_250, 4_700, 4_820], [0, 1, 1, 0], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateX: Math.round(x) }] };
  });
  const walkStripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -walkFrame.value * FRAME_WIDTH * scale }],
  }));
  const telescopeStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion
      ? 0
      : interpolate(clock.value, [4_700, 4_820], [1, 0], Extrapolation.CLAMP),
  }));
  const interactionStyle = useAnimatedStyle(() => {
    const opacity = reducedMotion
      ? interpolate(clock.value, [350, 650, 12_300, 12_700], [0, 1, 1, 0], Extrapolation.CLAMP)
      : interpolate(clock.value, [4_700, 4_820], [0, 1], Extrapolation.CLAMP);
    const foregroundDrop = reducedMotion
      ? 0
      : interpolate(clock.value, [9_000, 11_600], [0, 70 * scale], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY: Math.round(foregroundDrop) }] };
  });
  const interactionStripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -interactionFrame.value * FRAME_WIDTH * scale }],
  }));
  const starStyle = useAnimatedStyle(() => {
    const pulse = reducedMotion
      ? 1
      : interpolate(clock.value, [11_600, 11_930, 12_300], [1, 1.28, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: pulse }] };
  });
  const starGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(clock.value, [11_600, 11_930, 12_300], [0, 0.62, 0], Extrapolation.CLAMP),
    transform: [{ scale: reducedMotion ? 1 : 1.85 }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      clock.value,
      [0, 800, 12_300, POLARIS_OBSERVATION_DURATION_MS],
      [1, 0, 0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={styles.root} testID="polaris-observation-scene">
      <View
        style={[styles.stage, { width: stageWidth, height: stageHeight }]}
        testID="polaris-observation-stage"
      >
        <ReAnimated.View style={[StyleSheet.absoluteFill, worldStyle]}>
          <Image
            source={BACKGROUND}
            contentFit="fill"
            cachePolicy="memory-disk"
            style={[
              PIXELATED,
              styles.absolute,
              {
                left: -56 * scale,
                top: -63 * scale,
                width: 432 * scale,
                height: 243 * scale,
              },
            ]}
          />

          <ReAnimated.View
            pointerEvents="none"
            style={[
              styles.absolute,
              { left: 145 * scale, top: 96 * scale },
              telescopeStyle,
            ]}
          >
            <AtlasCrop
              scale={scale}
              sourceX={TELESCOPE_X}
              sourceY={0}
              width={FRAME_WIDTH}
              height={FRAME_HEIGHT}
            />
          </ReAnimated.View>

          <ReAnimated.View
            pointerEvents="none"
            style={[styles.absolute, { left: 0, top: 96 * scale }, walkingStyle]}
          >
            <View
              style={{
                width: FRAME_WIDTH * scale,
                height: FRAME_HEIGHT * scale,
                overflow: "hidden",
              }}
            >
              <ReAnimated.View
                style={[
                  styles.absolute,
                  {
                    width: ATLAS_WIDTH * scale,
                    height: ATLAS_HEIGHT * scale,
                  },
                  walkStripStyle,
                ]}
              >
                <Image
                  source={ATLAS}
                  contentFit="fill"
                  cachePolicy="memory-disk"
                  style={[PIXELATED, { width: ATLAS_WIDTH * scale, height: ATLAS_HEIGHT * scale }]}
                />
              </ReAnimated.View>
            </View>
          </ReAnimated.View>

          <ReAnimated.View
            pointerEvents="none"
            style={[
              styles.absolute,
              { left: 145 * scale, top: 96 * scale },
              interactionStyle,
            ]}
          >
            <View
              style={{
                width: FRAME_WIDTH * scale,
                height: FRAME_HEIGHT * scale,
                overflow: "hidden",
              }}
            >
              <ReAnimated.View
                style={[
                  styles.absolute,
                  {
                    top: -INTERACTION_ROW_Y * scale,
                    width: ATLAS_WIDTH * scale,
                    height: ATLAS_HEIGHT * scale,
                  },
                  interactionStripStyle,
                ]}
              >
                <Image
                  source={ATLAS}
                  contentFit="fill"
                  cachePolicy="memory-disk"
                  style={[PIXELATED, { width: ATLAS_WIDTH * scale, height: ATLAS_HEIGHT * scale }]}
                />
              </ReAnimated.View>
            </View>
          </ReAnimated.View>

          <ReAnimated.View
            pointerEvents="none"
            style={[
              styles.absolute,
              {
                left: (244 - STAR_SIZE / 2) * scale,
                top: (25 - STAR_SIZE / 2) * scale,
              },
              starGlowStyle,
            ]}
          >
            <AtlasCrop
              scale={scale}
              sourceX={STAR_X}
              sourceY={STAR_Y}
              width={STAR_SIZE}
              height={STAR_SIZE}
            />
          </ReAnimated.View>
          <ReAnimated.View
            pointerEvents="none"
            style={[
              styles.absolute,
              {
                left: (244 - STAR_SIZE / 2) * scale,
                top: (25 - STAR_SIZE / 2) * scale,
              },
              starStyle,
            ]}
          >
            <AtlasCrop
              scale={scale}
              sourceX={STAR_X}
              sourceY={STAR_Y}
              width={STAR_SIZE}
              height={STAR_SIZE}
            />
          </ReAnimated.View>
        </ReAnimated.View>

        <ReAnimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fade, fadeStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: deepSpace.bgEdge,
  },
  stage: {
    overflow: "hidden",
    backgroundColor: deepSpace.bgEdge,
  },
  absolute: { position: "absolute" },
  fade: { backgroundColor: deepSpace.bgEdge },
});
