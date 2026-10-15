// Transient event moments. A save or a found connection shows a small cue
// (shard / tier icon) for about a second and drives the SecondB head's face.
//
// ⚠ 2026-10-05 (Simon 결정 Q-261004-15 A, "가디 영역 전부 legacy"): 옛 캐릭터
//   다섯(아치·가디·루루·모모·루미)의 몸 그림을 이 순간에서 뺐다. 예전에는 이벤트마다
//   그 캐릭터 스프라이트(companionAlt · CompanionSprite)가 신호 옆에 튀어나왔고,
//   대화의 안전 멈춤에는 가디가 나왔다. 지금 남은 것은 신호 하나와 세컨비 머리의
//   표정뿐이다. 안전 이벤트(safetySoftStop · safetyClear)는 순간 자체가 없어졌다 -
//   멈춤은 대화 안의 글이 알린다. 잘라낸 원본은 E:/Legacy/2ndB 에 있다
//   (MANIFEST batch qa261004-chars). 파일 이름은 import 경로를 지키려고 그대로 둔다.

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";

import { ShardArt, type ShardId } from "@/components/art/IslandArt";
import { TierIcon, type TierIconId } from "@/components/art/TierIcon";
import { cosmic, semantic } from "@/lib/theme/tokens";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { reactExpression, type ExpressionMood } from "@/lib/companion/expression";

export type CompanionEvent = "journal_saved" | "capture_saved" | "link_found" | "imagine_ready";

export const companionEventMap = {
  journalSaved: { cue: "journal_saved" },
  auditCompleted: { cue: "journal_saved" },
  wikiSaved: { cue: "journal_saved" },
  captureSaved: { cue: "capture_saved" },
  linkImported: { cue: "capture_saved" },
  connectionFound: { cue: "link_found" },
  personaUpdated: { cue: "link_found" },
} as const satisfies Record<string, { cue: CompanionEvent }>;

export type CompanionEventKey = keyof typeof companionEventMap;

function eventCueArt(event: CompanionEvent): { kind: "shard"; id: ShardId; accent: string } | { kind: "tier"; id: TierIconId; accent: string } {
  switch (event) {
    case "journal_saved": return { kind: "shard", id: "journal_gold", accent: cosmic.pixelLamp };
    case "capture_saved": return { kind: "shard", id: "capture_mint", accent: cosmic.signalMint };
    case "link_found": return { kind: "tier", id: "link_capture", accent: cosmic.signalBlue };
    case "imagine_ready": return { kind: "shard", id: "imagine_pink", accent: cosmic.dreamPink };
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
          borderRadius: 0,
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
  cue: CompanionEvent;
}

// Every designed moment also drives the SecondB head's face, so the character
// reacts everywhere these fire — with the full expression vocabulary (faces.ts):
// a save is happy, fresh information is delight, a found connection is the smug
// 잘난척. A crisis surface must never trigger a cute facial reaction, which is
// why no safety event is a moment at all (see the header).
const EXPRESSION_BY_EVENT: Partial<Record<CompanionEventKey, ExpressionMood>> = {
  journalSaved: "happy",
  auditCompleted: "happy",
  wikiSaved: "delight",
  captureSaved: "happy",
  linkImported: "delight",
  connectionFound: "smug",
  personaUpdated: "delight",
};

export function useCompanionMoment(): { moment: ActiveMoment | null; fire: (key: CompanionEventKey) => void } {
  const [moment, setMoment] = useState<ActiveMoment | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useCallback((key: CompanionEventKey) => {
    const m = companionEventMap[key];
    if (timer.current) clearTimeout(timer.current);
    setMoment({ cue: m.cue });
    timer.current = setTimeout(() => setMoment(null), 1600);
    const exp = EXPRESSION_BY_EVENT[key];
    if (exp) reactExpression(exp);
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
    // ⚠ **신호는 페이드하지 않고 튀어나온다**(PIXEL-CLAY 규칙 4).
    //   예전에는 200ms 들어오고 300ms 나가며 opacity 를 흘렸다. 이징이
    //   계단이어도 **순간값은 소수**라 정적 반투명과 같은 문제가 된다
    //   (`/capture-full` 의 A축에 마지막으로 남은 한 건이 이것이었다).
    //   나타남은 **0과 1 사이의 즉시 전환**이고, 움직임은 미끄러짐이 맡는다.
    //   머무는 시간은 예전 페이드 시간만큼 늘려 체감을 맞췄다(1000 -> 1300).
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 200, easing: pixelStepsFor(200), useNativeDriver: true }),
      ]),
      Animated.delay(1300),
      Animated.timing(op, { toValue: 0, duration: 0, useNativeDriver: true }),
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
      {/* 신호가 이 상자의 유일한 자식이라 흐름 안에 둔다. 예전처럼 absolute 로 두면
          캐릭터 몸이 빠진 상자는 크기가 0 이 되어 신호가 엉뚱한 자리에 붙는다. */}
      <CompanionEventCue event={moment.cue} size={86} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cueFrame: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: semantic.surfaceAlt,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  cueGlow: {
    position: "absolute",
    width: "58%",
    height: "58%",
    borderRadius: 0,
    opacity: 0.12,
  },
  moment: {
    alignItems: "center",
    justifyContent: "center",
  },
});
