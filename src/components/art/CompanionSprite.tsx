// Premium transient companions. Event moments keep the old state-machine API,
// but the visible bodies now use the production premium worker PNG set, with
// refined shard/tier-icon cues for the moment burst.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { ShardArt, type ShardId } from "@/components/art/IslandArt";
import { TierIcon, type TierIconId } from "@/components/art/TierIcon";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";
import { cosmic } from "@/lib/theme/tokens";
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
  momo: "Momo, record keeper",
  lulu: "Lulu, capture collector",
  archi: "Archi, connection architect",
  vela: "Vela, imagination guide",
  gadi: "Gadi, safety guard",
};

const COMPANION_BASE = "/assets/2ndb-production-premium-v1/workers";

export function getCompanionSpritePath(
  companion: CompanionName,
  state: CompanionState = "idle",
  basePath = COMPANION_BASE,
): string {
  const suffix = state === "idle" || state === "sleep" ? "idle" : "walk_strip_6f";
  return `${basePath}/${companion}_premium_${suffix}.png`;
}

export function getCompanionCuePath(event: CompanionEvent, basePath = "/assets/2ndb-refine"): string {
  switch (event) {
    case "journal_saved": return `${basePath}/shards/shard_journal_gold.png`;
    case "capture_saved": return `${basePath}/shards/shard_capture_mint.png`;
    case "imagine_ready": return `${basePath}/shards/shard_imagine_pink.png`;
    case "link_found": return `${basePath}/tier-icons/link_chain_premium.png`;
    case "safety_soft_stop": return `${basePath}/tier-icons/heart_connection_premium.png`;
    default: return `${basePath}/tier-icons/star_spark_premium.png`;
  }
}

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

function isMovingState(state: CompanionState): boolean {
  return [
    "fly_1",
    "fly_2",
    "scan",
    "success",
    "dash",
    "linking",
    "measure",
    "highlight",
    "build",
    "spark",
    "dream",
    "unfold",
    "save",
    "guard",
    "alert",
    "soft_stop",
    "clear",
  ].includes(state);
}

function cueForState(state: CompanionState): { kind: "shard"; id: ShardId } | { kind: "tier"; id: TierIconId } | null {
  switch (state) {
    case "note":
    case "store":
    case "read":
    case "label":
      return { kind: "shard", id: "journal_gold" };
    case "carrying_shard":
    case "scan":
    case "success":
    case "dash":
      return { kind: "shard", id: "capture_mint" };
    case "linking":
    case "measure":
    case "highlight":
    case "build":
    case "thinking":
      return { kind: "tier", id: "link_capture" };
    case "spark":
    case "dream":
    case "unfold":
    case "save":
      return { kind: "shard", id: "imagine_pink" };
    case "guard":
    case "alert":
    case "soft_stop":
    case "clear":
      return { kind: "tier", id: "heart_relationship" };
    case "happy":
      return { kind: "tier", id: "spark_recent" };
    default:
      return null;
  }
}

function CompanionStateAccent({ state, size }: { state: CompanionState; size: number }) {
  const cue = cueForState(state);
  if (!cue) return null;
  const cueSize = Math.max(14, size * 0.34);
  return (
    <View style={[styles.stateCue, { right: -size * 0.12, bottom: -size * 0.02 }]}>
      {cue.kind === "shard" ? <ShardArt id={cue.id} size={cueSize} /> : <TierIcon id={cue.id} size={cueSize} />}
    </View>
  );
}

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
  style?: StyleProp<ViewStyle>;
}) {
  const a11y = decorative
    ? { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const }
    : { accessible: true, accessibilityLabel: companionAlt[companion] };
  const asleep = state === "sleep";

  return (
    <Animated.View style={style} {...a11y}>
      <View style={[styles.spriteBox, { width: size, height: size, opacity: asleep ? 0.62 : 1 }]}>
        <WorkerSprite id={companion as WorkerId} size={size} paused={!isMovingState(state) || asleep} />
        <CompanionStateAccent state={state} size={size} />
      </View>
    </Animated.View>
  );
}

function eventCueArt(event: CompanionEvent): { kind: "shard"; id: ShardId; accent: string } | { kind: "tier"; id: TierIconId; accent: string } {
  switch (event) {
    case "journal_saved": return { kind: "shard", id: "journal_gold", accent: cosmic.pixelLamp };
    case "capture_saved": return { kind: "shard", id: "capture_mint", accent: cosmic.signalMint };
    case "link_found": return { kind: "tier", id: "link_capture", accent: cosmic.signalBlue };
    case "imagine_ready": return { kind: "shard", id: "imagine_pink", accent: cosmic.dreamPink };
    case "safety_soft_stop": return { kind: "tier", id: "heart_relationship", accent: cosmic.guardRose };
    default: return { kind: "tier", id: "spark_recent", accent: cosmic.signalMint };
  }
}

export function CompanionEventCue({ event, size = 84, style }: { event: CompanionEvent; size?: number; style?: StyleProp<ViewStyle> }) {
  const art = eventCueArt(event);
  const inner = size * 0.58;
  return (
    <Animated.View
      style={[
        styles.cueFrame,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          borderColor: art.accent,
          shadowColor: art.accent,
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.cueGlow, { backgroundColor: art.accent }]} />
      {art.kind === "shard" ? <ShardArt id={art.id} size={inner} /> : <TierIcon id={art.id} size={inner} />}
    </Animated.View>
  );
}

interface ActiveMoment {
  companion: CompanionName;
  state: CompanionState;
  cue: CompanionEvent;
}

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

export function CompanionMoment({ moment, style }: { moment: ActiveMoment; style?: StyleProp<ViewStyle> }) {
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
      style={[styles.moment, { opacity: op, transform: [{ translateY: ty }] }, style]}
    >
      <CompanionEventCue event={moment.cue} size={86} style={styles.momentCue} />
      <CompanionSprite companion={moment.companion} state={moment.state} size={56} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  spriteBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  stateCue: {
    position: "absolute",
  },
  cueFrame: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "rgba(7,10,24,0.68)",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  cueGlow: {
    position: "absolute",
    width: "58%",
    height: "58%",
    borderRadius: 99,
    opacity: 0.12,
  },
  moment: {
    alignItems: "center",
    justifyContent: "center",
  },
  momentCue: {
    position: "absolute",
  },
});
