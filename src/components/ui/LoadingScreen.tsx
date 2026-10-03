// Approved HustleK PNG poses, camera and sounds share one playback clock.
import { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, useWindowDimensions, View, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { Asset } from "expo-asset";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PlainText as Text } from "@/components/ui/PlainText";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { useOpeningSounds } from "@/lib/audio/use-opening-sounds";
import { APPROVED_OPENING_ASSETS, APPROVED_OPENING_DURATION_MS, APPROVED_OPENING_IMAGE_SOURCES, getApprovedOpeningCues, getApprovedOpeningScene } from "@/lib/opening/hustlek-approved";
import { deepSpace, typography } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export type OpeningPhase = "story" | "waiting-ready" | "ready" | "done";
export interface OpeningPlan { phase: OpeningPhase; shouldContinue: boolean }
interface OpeningStateInput { elapsedMs: number; readyAtMs: number | null; tapAtMs: number | null; reducedMotion: boolean }
export function openingStateAt({ elapsedMs, readyAtMs, tapAtMs, reducedMotion }: OpeningStateInput): OpeningPlan {
  const elapsed = Math.max(0, elapsedMs), ready = readyAtMs !== null && elapsed >= readyAtMs;
  if (tapAtMs !== null && elapsed >= tapAtMs) return { phase: ready ? "done" : "waiting-ready", shouldContinue: ready };
  const end = reducedMotion ? 1200 : APPROVED_OPENING_DURATION_MS;
  if (elapsed < end) return { phase: "story", shouldContinue: false };
  return { phase: ready ? "done" : "waiting-ready", shouldContinue: ready };
}
export function createOpeningClock(now: () => number = Date.now) {
  let accumulated = 0, startedAt: number | null = null;
  return {
    elapsed: () => accumulated + (startedAt === null ? 0 : Math.max(0, now() - startedAt)),
    start: () => { if (startedAt === null) startedAt = now(); },
    pause: () => { if (startedAt !== null) { accumulated += Math.max(0, now() - startedAt); startedAt = null; } },
  };
}
export function createOpeningTicker(clock: Pick<ReturnType<typeof createOpeningClock>, "elapsed">, onTick: (elapsedMs: number) => void): () => void {
  const timer = setInterval(() => onTick(clock.elapsed()), 16);
  return () => clearInterval(timer);
}
export function deliverContinueOnce(gate: { current: boolean }, onContinue?: () => void): void {
  if (gate.current) return;
  gate.current = true;
  onContinue?.();
}

type ImageBox = { left: number; top: number; width: number; height: number; source: number; zIndex?: number };
const webPixels = { imageRendering: "pixelated" } as ImageStyle;
function SceneImage({ box, testID, onError }: { box: ImageBox; testID: string; onError: () => void }) {
  return <Image testID={testID} pointerEvents="none" source={box.source} transition={0} contentFit="fill" cachePolicy="memory-disk" allowDownscaling={false} priority="high" onError={onError} accessible={false}
    style={[styles.image, { left: box.left, top: box.top, width: box.width, height: box.height, zIndex: box.zIndex ?? 0 }, Platform.OS === "web" ? webPixels : undefined]} />;
}

interface Props { ready?: boolean; onContinue?: () => void }
export function LoadingScreen({ ready = true, onContinue }: Props = {}) {
  const { t } = useTranslation("common"), reducedMotion = useReducedMotionPref(), insets = useSafeAreaInsets(), windowSize = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: windowSize.width, height: windowSize.height });
  const [assetsReady, setAssetsReady] = useState(false), [assetError, setAssetError] = useState(false), [attempt, setAttempt] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive" && (Platform.OS !== "web" || typeof document === "undefined" || !document.hidden));
  const [elapsedMs, setElapsedMs] = useState(0), [tapAtMs, setTapAtMs] = useState<number | null>(null);
  const clock = useRef(createOpeningClock()), continued = useRef(false), cueFrom = useRef(-Number.EPSILON);
  const sounds = useOpeningSounds(APPROVED_OPENING_ASSETS.audio), soundRef = useRef(sounds);
  soundRef.current = sounds;
  const playbackReady = assetsReady && (reducedMotion || !sounds.enabled || sounds.ready);
  const plan = openingStateAt({ elapsedMs, readyAtMs: ready ? 0 : null, tapAtMs, reducedMotion });
  const displayMs = reducedMotion ? APPROVED_OPENING_DURATION_MS : Math.min(elapsedMs, APPROVED_OPENING_DURATION_MS);
  const scene = getApprovedOpeningScene(displayMs, Math.max(1, viewport.width), Math.max(1, viewport.height));

  useEffect(() => {
    let active = true;
    setAssetsReady(false); setAssetError(false);
    void Asset.loadAsync(APPROVED_OPENING_IMAGE_SOURCES).then(assets => Image.prefetch(assets.map(asset => asset.localUri ?? asset.uri), { cachePolicy: "memory-disk" })).then(okay => {
      if (!active) return;
      if (!okay) { setAssetError(true); return; }
      setAssetsReady(true);
    }).catch(() => { if (active) setAssetError(true); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const change = (active: boolean) => {
      if (!active) { clock.current.pause(); soundRef.current.stop(); cueFrom.current = clock.current.elapsed(); }
      setForeground(active);
    };
    const app = AppState.addEventListener("change", state => change(state === "active"));
    const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => change(false)) : undefined;
    const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => change(true)) : undefined;
    const visibility = () => change(!document.hidden);
    if (Platform.OS === "web") document.addEventListener("visibilitychange", visibility);
    return () => { app.remove(); blur?.remove(); focus?.remove(); if (Platform.OS === "web") document.removeEventListener("visibilitychange", visibility); clock.current.pause(); soundRef.current.stop(); };
  }, []);

  useEffect(() => {
    if (!playbackReady || assetError || !foreground || plan.shouldContinue || plan.phase === "waiting-ready") { clock.current.pause(); soundRef.current.stop(); return; }
    clock.current.start();
    const tick = (value: number) => {
      if (!reducedMotion) for (const cue of getApprovedOpeningCues(cueFrom.current, value)) soundRef.current.play(cue);
      cueFrom.current = value;
      setElapsedMs(value);
    };
    tick(clock.current.elapsed());
    const stop = createOpeningTicker(clock.current, tick);
    return () => { stop(); clock.current.pause(); soundRef.current.stop(); };
  }, [playbackReady, assetError, foreground, reducedMotion, plan.shouldContinue, plan.phase]);

  useEffect(() => {
    if (!plan.shouldContinue) return;
    clock.current.pause(); soundRef.current.stop();
    deliverContinueOnce(continued, onContinue);
  }, [plan.shouldContinue, onContinue]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const css = document.createElement("style");
    css.textContent = '[data-testid="loading-screen"] img{image-rendering:pixelated}';
    document.head.append(css);
    return () => css.remove();
  }, []);

  function skip() {
    soundRef.current.stop();
    const current = clock.current.elapsed();
    setTapAtMs(current); setElapsedMs(current);
  }
  const failImage = () => setAssetError(true);
  return <View testID="loading-screen" style={styles.container} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
  }} accessibilityLabel={t("loadingGate.loading")}>
    <StatusBar hidden animated={false} />
    <View testID="hustlek-approved-opening" pointerEvents="none" style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SceneImage box={scene.background} testID="opening-background" onError={failImage} />
      <SceneImage box={scene.telescope} testID="opening-telescope" onError={failImage} />
      {assetsReady && scene.character ? <SceneImage box={scene.character} testID="opening-character" onError={failImage} /> : null}
      <SceneImage box={scene.star} testID="opening-polaris" onError={failImage} />
      {scene.twinkle.rects.map((pixel, index) => <View key={index} style={[styles.pixel, { left: scene.twinkle.left + pixel.left, top: scene.twinkle.top + pixel.top, width: pixel.width, height: pixel.height, backgroundColor: pixel.color, opacity: pixel.alpha }]} />)}
    </View>
    {/* No visible buttons over the opening (Simon localhost QA 2026-10-03: the
        skip and sound buttons were removed). Tapping anywhere still ends it once
        the app is ready, and screen readers reach the same action here. Sound
        keeps its platform default: on in the native app, off on the web. */}
    <Pressable testID="opening-skip" style={styles.tapLayer} onPress={skip} disabled={!ready} accessibilityRole="button" accessibilityLabel={t("loadingGate.skip")} accessibilityHint={t("loadingGate.skipHint")} accessibilityState={{ disabled: !ready }}>
      <View pointerEvents="none" style={styles.fill} />
    </Pressable>
    {assetError ? <Pressable testID="opening-retry" style={[styles.error, { bottom: insets.bottom + 32 }]} onPress={() => setAttempt(value => value + 1)} accessibilityRole="button"><Text style={styles.buttonText}>{t("loadingGate.retry")}</Text></Pressable> : null}
    {!assetError && (!playbackReady || plan.phase === "waiting-ready") ? <Text style={[styles.hint, { bottom: insets.bottom + 32 }]}>{t("loadingGate.loading")}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", height: "100%", overflow: "hidden", backgroundColor: deepSpace.bgEdge },
  stage: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" },
  image: { position: "absolute" },
  pixel: { position: "absolute", zIndex: 5 },
  tapLayer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 5 },
  fill: { flex: 1 },
  buttonText: { color: deepSpace.textHi, fontFamily: fontFamilies.pixelKo, fontSize: typography.sizes.xs, lineHeight: 20, paddingBottom: 2 },
  hint: { position: "absolute", zIndex: 6, left: 24, right: 24, textAlign: "center", color: deepSpace.textHi, fontFamily: fontFamilies.pixelKo, fontSize: typography.sizes.xs, lineHeight: 20, paddingBottom: 2 },
  error: { position: "absolute", zIndex: 6, alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 16, backgroundColor: deepSpace.bgEdge },
});
