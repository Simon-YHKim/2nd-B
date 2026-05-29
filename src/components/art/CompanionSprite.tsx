// Companion sprite pack v2 — the five event characters (momo / lulu /
// archi / vela / gadi). SecondB stays the persistent FAB/chat companion
// (src/components/art/SecondBSprite.tsx); these five appear only for a
// brief event moment (asset order §4: ≤1.8s, max one on screen, never
// overlapping the FAB/sheet, decorative/aria-hidden).
//
// Rendered via SvgXml from the already-installed react-native-svg (same
// approach as the rest of the art layer — cross-platform, no bundler
// config). getCompanion*Path are kept for API parity / web prefetch.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";

import { COMPANION_XML } from "./companionXml";
import { prefersReducedMotion } from "@/lib/motion/signature";

export type CompanionName = "momo" | "lulu" | "archi" | "vela" | "gadi";

export type CompanionState =
  | "idle" | "note" | "store" | "read" | "label" | "happy" | "sleep"
  | "fly_1" | "fly_2" | "carrying_shard" | "scan" | "success" | "dash"
  | "linking" | "measure" | "highlight" | "thinking" | "build"
  | "spark" | "dream" | "unfold" | "save"
  | "guard" | "alert" | "soft_stop" | "clear";

export type CompanionEvent =
  | "journal_saved" | "capture_saved" | "link_found" | "imagine_ready" | "safety_soft_stop";

export const companionAlt: Record<CompanionName, string> = {
  momo: "모모, 기록 관리자",
  lulu: "루루, 수집 드론",
  archi: "아치, 연결 설계자",
  vela: "벨라, 공상 확장자",
  gadi: "가디, 안전 관리자",
};

const COMPANION_BASE = "/assets/cosmic-pixel-v2/companions";

export function getCompanionSpritePath(
  companion: CompanionName,
  state: CompanionState = "idle",
  basePath = COMPANION_BASE,
): string {
  return `${basePath}/sprites/${companion}/${companion}_${state}.svg`;
}

export function getCompanionCuePath(event: CompanionEvent, basePath = COMPANION_BASE): string {
  return `${basePath}/event_cues/${event}.svg`;
}

/** Event → which companion, which state, and which cue glyph (asset order §3). */
export const companionEventMap = {
  journalSaved: { companion: "momo", state: "store", cue: "journal_saved" },
  auditCompleted: { companion: "momo", state: "read", cue: "journal_saved" },
  wikiSaved: { companion: "momo", state: "label", cue: "journal_saved" },
  captureSaved: { companion: "lulu", state: "carrying_shard", cue: "capture_saved" },
  linkImported: { companion: "lulu", state: "success", cue: "capture_saved" },
  connectionFound: { companion: "archi", state: "linking", cue: "link_found" },
  personaUpdated: { companion: "archi", state: "build", cue: "link_found" },
  imagineStarted: { companion: "vela", state: "spark", cue: "imagine_ready" },
  imagineSaved: { companion: "vela", state: "save", cue: "imagine_ready" },
  safetySoftStop: { companion: "gadi", state: "soft_stop", cue: "safety_soft_stop" },
  safetyClear: { companion: "gadi", state: "clear", cue: "safety_soft_stop" },
} as const satisfies Record<string, { companion: CompanionName; state: CompanionState; cue: CompanionEvent }>;

export type CompanionEventKey = keyof typeof companionEventMap;

/** One companion sprite. Decorative by default (aria-hidden). */
export function CompanionSprite({
  companion,
  state = "idle",
  size = 64,
  decorative = true,
  style,
}: {
  companion: CompanionName;
  state?: CompanionState;
  size?: number;
  decorative?: boolean;
  style?: ViewStyle;
}) {
  const xml = COMPANION_XML[`${companion}_${state}`] ?? COMPANION_XML[`${companion}_idle`];
  const a11y = decorative
    ? { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const }
    : { accessible: true, accessibilityLabel: companionAlt[companion] };
  return (
    <Animated.View style={style} {...a11y}>
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}

/** A small event-cue burst glyph (96×80). Always decorative. */
export function CompanionEventCue({ event, size = 84, style }: { event: CompanionEvent; size?: number; style?: ViewStyle }) {
  const xml = COMPANION_XML[`cue_${event}`];
  if (!xml) return null;
  return (
    <Animated.View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={size} height={(size * 80) / 96} />
    </Animated.View>
  );
}

interface ActiveMoment {
  companion: CompanionName;
  state: CompanionState;
  cue: CompanionEvent;
}

/**
 * Fire a brief companion event moment. Holds one at a time (asset order §4
 * "한 화면에 2명 이상 금지"); auto-clears after ~1.6s. `fire` takes a
 * companionEventMap key. Render the returned `moment` with <CompanionMoment>.
 */
export function useCompanionMoment(): { moment: ActiveMoment | null; fire: (key: CompanionEventKey) => void } {
  const [moment, setMoment] = useState<ActiveMoment | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useCallback((key: CompanionEventKey) => {
    const m = companionEventMap[key];
    if (timer.current) clearTimeout(timer.current);
    setMoment({ companion: m.companion, state: m.state, cue: m.cue });
    timer.current = setTimeout(() => setMoment(null), 1600);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { moment, fire };
}

/**
 * The transient visual for an event moment: cue burst behind + companion
 * sprite in front, entering and leaving within ~1.5s (asset order §4/§6).
 * Decorative; pass `style` to position it clear of the FAB / bottom sheet.
 */
export function CompanionMoment({ moment, style }: { moment: ActiveMoment; style?: ViewStyle }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    if (prefersReducedMotion()) {
      op.setValue(1);
      ty.setValue(0);
      return;
    }
    op.setValue(0);
    ty.setValue(8);
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(1000),
      Animated.timing(op, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [moment, op, ty]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ opacity: op, transform: [{ translateY: ty }], alignItems: "center", justifyContent: "center" }, style]}
    >
      <CompanionEventCue event={moment.cue} size={84} style={{ position: "absolute" }} />
      <CompanionSprite companion={moment.companion} state={moment.state} size={52} />
    </Animated.View>
  );
}
