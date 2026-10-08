// Compatibility entrypoint for all character surfaces. The displayed character is HustleK.
// A portrait stays at its anchor; only meaningful events change its expression.
import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { M3Persona } from "@/lib/theme/m3";
import type { HustleKExpressionId } from "@/lib/assets/hustlek";
import { currentHold, subscribeExpression, subscribeHold, type Expression } from "@/lib/companion/expression";
import { hustlekExpressionFor } from "@/lib/companion/hustlek-expression";
import { HustleKPortrait } from "@/components/character/HustleKPortrait";

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
}

export function SecondbHead({ mood = "neutral", expression, size = 48, accessibilityLabel, style }: SecondbHeadProps) {
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

  // No idle rolls, pointer tracking or bob: expression changes have a context.
  const eventExpr = reactExpr ?? holdExpr;
  const portraitExpression = eventExpr ? hustlekExpressionFor(eventExpr) : expression ?? hustlekExpressionFor(mood);

  return (
    <View style={[styles.root, style]}>
      <HustleKPortrait expression={portraitExpression} size={size} accessibilityLabel={accessibilityLabel} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
});
