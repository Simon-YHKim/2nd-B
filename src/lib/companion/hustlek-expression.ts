import type { HustleKExpressionId } from "@/lib/assets/hustlek";
import type { Expression } from "./faces";

// Existing event names stay compatible. The approved package has no wink/whistle
// pose, so their friendly/idle meanings use the closest supplied expression.
const EXPRESSIONS: Record<Expression, HustleKExpressionId> = {
  neutral: "A01",
  positive: "A02",
  negative: "C07",
  happy: "A04",
  delight: "A12",
  smug: "A07",
  wink: "A08",
  surprised: "C01",
  thinking: "B04",
  sad: "C08",
  bored: "B12",
  whistle: "D12",
  sleepy: "D10",
};

export function hustlekExpressionFor(expression: Expression): HustleKExpressionId {
  return EXPRESSIONS[expression];
}
