import { forwardRef, useState, type ReactNode } from "react";
import {
  Animated, FlatList, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
  type FlatListProps, type PressableProps, type ScrollViewProps, type StyleProp, type TextInputProps,
  type TouchableOpacityProps, type TouchableWithoutFeedbackProps, type ViewProps, type ViewStyle,
} from "react-native";

import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { PhoneForegroundProvider, usePhoneDesign } from "@/lib/theme/phone-design-context";
import { phoneFlatSurface, phoneInputStyle, phoneStyle } from "@/lib/theme/phone-design";
import { phoneIos } from "@/lib/theme/phone-ios";
import { useFontStyle } from "@/lib/settings/readable-font";
import { fontFamilies } from "@/theme/typography";

// The names also remain valid as ref types when imported as RN aliases.
export type PhoneView = View;
export type PhoneTextInput = TextInput;
export type PhoneScrollView = ScrollView;
export type PhoneFlatList<T> = FlatList<T>;
export type PhoneTouchableOpacity = View;

function mapped<T extends object>(style: StyleProp<T>): T | undefined {
  const flat = StyleSheet.flatten(style);
  return flat ? phoneStyle(flat) as T : undefined;
}

/** Put the stepped surface behind the existing children, without a layout wrapper. */
function surface(style: StyleProp<ViewStyle>, pressed = false): { style: StyleProp<ViewStyle>; backdrop: ReactNode; foreground?: string } {
  const next = mapped(style);
  const color = next?.backgroundColor;
  // Dots, tracks and glyph cells are already pixel rectangles, not cards.
  if (typeof next?.height === "number" && next.height < 20 || typeof next?.width === "number" && next.width < 20) {
    return { style: [next, color === phoneIos.cell || color === phoneIos.grouped ? { backgroundColor: phoneIos.separator } : null], backdrop: null };
  }
  if (typeof color !== "string" || color === "transparent" || color === phoneIos.grouped) {
    return { style: next, backdrop: null, foreground: color === phoneIos.grouped ? phoneIos.label : undefined };
  }
  const fill = pressed ? (color === phoneIos.blue ? phoneIos.bluePressed : phoneIos.fill) : color;
  return {
    style: [next, phoneFlatSurface, styles.layerHost],
    backdrop: <PixelRoundRect pointerEvents="none" fill={fill} corner={typeof next?.height === "number" && next.height < 40 ? "small" : "card"} style={styles.backdrop} />,
    foreground: color === phoneIos.blue || color === phoneIos.bluePressed ? phoneIos.onBlue : phoneIos.label,
  };
}

export const PhoneView = forwardRef<View, ViewProps>(function PhoneView({ style, children, ...rest }, ref) {
  const phone = usePhoneDesign();
  if (!phone) return <View ref={ref} {...rest} style={style}>{children}</View>;
  const visual = surface(style);
  return <View ref={ref} {...rest} style={visual.style}>{visual.backdrop}<PhoneForegroundProvider color={visual.foreground}>{children}</PhoneForegroundProvider></View>;
});

export const PhonePressable = forwardRef<View, PressableProps>(function PhonePressable({ style, children, onPressIn, onPressOut, ...rest }, ref) {
  const phone = usePhoneDesign();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  if (!phone) return <Pressable ref={ref} {...rest} style={style} onPressIn={onPressIn} onPressOut={onPressOut}>{children}</Pressable>;
  const active = pressed && !rest.disabled;
  const interaction = { pressed: active, hovered };
  const resolved = typeof style === "function" ? style(interaction) : style;
  const visual = surface(resolved, active);
  return <Pressable ref={ref} {...rest} style={[styles.touch, visual.style]}
    onPressIn={event => { setPressed(true); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); onPressOut?.(event); }}
    onHoverIn={event => { setHovered(true); rest.onHoverIn?.(event); }}
    onHoverOut={event => { setHovered(false); rest.onHoverOut?.(event); }}>
    {visual.backdrop}<PhoneForegroundProvider color={visual.foreground}>{typeof children === "function" ? children(interaction) : children}</PhoneForegroundProvider>
  </Pressable>;
});

export const PhoneTextInput = forwardRef<TextInput, TextInputProps>(function PhoneTextInput(props, ref) {
  const phone = usePhoneDesign();
  const { fontStyle } = useFontStyle();
  const [focused, setFocused] = useState(false);
  if (!phone) return <TextInput ref={ref} {...props} />;
  const { style, onFocus, onBlur, ...rest } = props;
  return <TextInput ref={ref} {...rest}
    placeholderTextColor={phoneIos.label2} selectionColor={phoneIos.blue} cursorColor={phoneIos.blue}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[phoneInputStyle, mapped(style), {
      color: phoneIos.label, backgroundColor: phoneIos.cell,
      fontFamily: fontStyle === "readable" ? fontFamilies.readable : "Galmuri14",
      fontSize: 15, lineHeight: 22, minHeight: 44,
      borderColor: focused ? phoneIos.blue : phoneIos.separator,
      borderWidth: 2,
    }]} />;
});

export const PhoneScrollView = forwardRef<ScrollView, ScrollViewProps>(function PhoneScrollView({ style, contentContainerStyle, ...rest }, ref) {
  const phone = usePhoneDesign();
  return <ScrollView ref={ref} {...rest} style={phone ? mapped(style) : style}
    contentContainerStyle={phone ? mapped(contentContainerStyle) : contentContainerStyle} />;
});

function PhoneFlatListInner<T>({ style, contentContainerStyle, ...rest }: FlatListProps<T>, ref: React.ForwardedRef<FlatList<T>>) {
  const phone = usePhoneDesign();
  return <FlatList ref={ref} {...rest} style={phone ? mapped(style) : style}
    contentContainerStyle={phone ? mapped(contentContainerStyle) : contentContainerStyle} />;
}
export const PhoneFlatList = forwardRef(PhoneFlatListInner) as <T>(props: FlatListProps<T> & React.RefAttributes<FlatList<T>>) => React.ReactElement;

export const PhoneTouchableOpacity = forwardRef<View, TouchableOpacityProps>(function PhoneTouchableOpacity({ style, children, ...rest }, ref) {
  const phone = usePhoneDesign();
  if (!phone) return <TouchableOpacity ref={ref} {...rest} style={style}>{children}</TouchableOpacity>;
  const visual = surface(style);
  return <TouchableOpacity ref={ref} {...rest} activeOpacity={1} style={[styles.touch, visual.style]}>
    {visual.backdrop}<PhoneForegroundProvider color={visual.foreground}>{children}</PhoneForegroundProvider>
  </TouchableOpacity>;
});

export function PhoneTouchableWithoutFeedback(props: TouchableWithoutFeedbackProps) {
  return <TouchableWithoutFeedback {...props} />;
}

export const PhoneAnimatedView = Animated.createAnimatedComponent(PhoneView);

const styles = StyleSheet.create({
  touch: { minHeight: 44 },
  layerHost: { zIndex: 0 },
  backdrop: { ...StyleSheet.absoluteFill, zIndex: -1 },
});
