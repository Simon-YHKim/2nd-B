// Compatibility entrypoint for all character surfaces. The displayed character is HustleK.
// A portrait stays at its anchor. Home may opt into quiet expressions and speech.
import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { M3Persona } from "@/lib/theme/m3";
import type { HustleKExpressionId } from "@/lib/assets/hustlek";
import { currentHold, subscribeExpression, subscribeHold, type Expression } from "@/lib/companion/expression";
import { hustlekExpressionFor } from "@/lib/companion/hustlek-expression";
import { HustleKPortrait } from "@/components/character/HustleKPortrait";
import { hustlekAllowsLife } from "@/lib/companion/hustlek-life";
import { useHustleKLife } from "@/lib/companion/use-hustlek-life";

export type SecondbMood = "positive" | "neutral" | "negative";
interface SecondbHeadProps {
  mood?: SecondbMood;
  /** Explicit context supplied by the caller, restored after an app reaction/hold. */
  expression?: HustleKExpressionId;
  /** Legacy persona identifier retained for caller compatibility; the portrait is never tinted. */
  persona?: M3Persona;
  size?: number;
  /** @deprecated Portraits stay fixed; retained so existing callers remain compatible. */
  track?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  speaking?: boolean;
  /** Currently revealed typewriter text, used to close the mouth on punctuation. */
  speechText?: string;
  /** Only live home portraits opt in; message history remains still. */
  idle?: boolean;
  /** Route focus and covering overlays supplied by the owning surface. */
  active?: boolean;
}

export function SecondbHead({ mood = "neutral", expression, size = 48, accessibilityLabel, style, speaking = false, speechText, idle = false, active = true }: SecondbHeadProps) {
  const [reactExpr, setReactExpr] = useState<Expression | null>(null);
  const [holdExpr, setHoldExpr] = useState<Expression | null>(currentHold);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offReact = subscribeExpression((expr, dur) => {
      setReactExpr(expr);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReactExpr(null), dur);
    });
    const offHold = subscribeHold(setHoldExpr);
    return () => {
      offReact();
      offHold();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // App reactions/holds and explicit context always win over home embellishments.
  const eventExpr = reactExpr ?? holdExpr;
  const portraitExpression = eventExpr ? hustlekExpressionFor(eventExpr) : expression ?? hustlekExpressionFor(mood);
  const life = useHustleKLife({ speaking, speechText, idle, active, blocked: !!eventExpr || !hustlekAllowsLife(portraitExpression) });

  return (
    <View style={[styles.root, style]}>
      <HustleKPortrait expression={life.idleExpression ?? portraitExpression} mouth={life.mouth} size={size} accessibilityLabel={accessibilityLabel} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
});
