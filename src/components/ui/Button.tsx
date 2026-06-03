import type { StyleProp, ViewStyle } from "react-native";

import { PremiumButton } from "@/components/premium/surfaces";
import type { PremiumButtonProps } from "@/components/premium/surfaces";

type Variant = "primary" | "secondary" | "danger";

export interface ButtonProps extends Omit<PremiumButtonProps, "variant" | "icon" | "style"> {
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
}

// Legacy Button facade kept for older screens. Rendering through PremiumButton
// makes every remaining Button usage share the current premium controls.
export function Button({ variant = "primary", ...props }: ButtonProps) {
  return <PremiumButton {...props} variant={variant} />;
}
