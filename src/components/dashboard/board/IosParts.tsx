// 인앱 핸드폰의 '픽셀 아이폰' 부품(Simon 2026-10-07: "아이폰같은 UI … 픽셀 스러움은 살린채로").
//
// iOS 의 버튼 · 큰 제목 · 묶음 목록 · 줄을 계단 모서리(PixelRoundRect)와 Galmuri 로 그린다. 색은 iOS 밝은 기본
// (phoneIos). 폰이 직접 그리는 화면만 쓴다 - 폰 안에 띄우는 앱 화면은 자기 모양 그대로다.
//
// 모든 누르는 자리는 44 이상이다(보이는 칸이 작아도 누르는 영역은 44).
// 눌림 표시는 onPressIn/onPressOut 상태로 한다 - 함수형 style · 함수 자식은 Android Fabric 이 버린다(#680).

import { Children, Fragment, isValidElement, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import { phoneIos } from "@/lib/theme/phone-ios";

/** 폰 글자: 앱 테마의 글자색을 물려받지 않고 iOS 본문색을 쓴다. */
export function IosText({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.text, style]} />;
}

/** Board cards share one caption heading and a trailing control or value. */
export function IosCardHeader({ glyph, title, trailing, iconColor = phoneIos.blue }: {
  glyph: AnyGlyphName; title: string; trailing?: ReactNode; iconColor?: string;
}) {
  return <View style={styles.cardHeader}>
    <PixelGlyph name={glyph} size={16} color={iconColor} />
    <IosText variant="caption" accessibilityRole="header" style={styles.cardTitle}>{title}</IosText>
    {trailing}
  </View>;
}

/** Icon-only action with the same 44px target as other phone controls. */
export function IosIconButton({ glyph, label, onPress }: { glyph: AnyGlyphName; label: string; onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    style={[styles.iconButton, pressed ? styles.rowPressed : null]}>
    <PixelGlyph name={glyph} size={16} color={phoneIos.blue} />
  </Pressable>;
}

/** iOS 식 작은 버튼: 회색 칸에 파란 글자, 주 버튼은 파랑 칸에 흰 글자. */
export function IosButton({ label, onPress, primary = false, disabled = false, busy = false, glyph }: {
  label: string; onPress: () => void; primary?: boolean; disabled?: boolean; busy?: boolean; glyph?: AnyGlyphName;
}) {
  const [pressed, setPressed] = useState(false);
  return <Pressable onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} disabled={disabled}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} style={styles.button}>
    <PixelRoundRect corner="small" style={styles.buttonFace}
      fill={primary ? (pressed ? phoneIos.bluePressed : phoneIos.blue) : (pressed ? phoneIos.gray3 : phoneIos.fill)}>
      {glyph ? <PixelGlyph name={glyph} size={16} color={primary ? phoneIos.onBlue : disabled ? phoneIos.label2 : phoneIos.blue} /> : null}
      <IosText variant="caption" style={primary ? styles.buttonTextPrimary : disabled ? styles.buttonTextDisabled : styles.buttonText}>{label}</IosText>
    </PixelRoundRect>
  </Pressable>;
}

/** iOS 큰 제목. */
export function IosLargeTitle({ children }: { children: ReactNode }) {
  return <IosText variant="heading" accessibilityRole="header" style={styles.largeTitle}>{children}</IosText>;
}

/** 묶음 위의 구획 머리(작은 회색 글자). */
export function IosSectionHeader({ children }: { children: ReactNode }) {
  return <IosText variant="caption" accessibilityRole="header" style={styles.sectionHeader}>{children}</IosText>;
}

/** iOS 묶음 목록: 흰 계단 모서리 칸 안에 줄들, 줄 사이에 구분선. */
export function IosGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return <PixelRoundRect fill={phoneIos.cell} style={[styles.group, style]}>
    {rows.map((row, index) => <Fragment key={row.key ?? index}>
      {index > 0 ? <View style={styles.separator} /> : null}
      {row}
    </Fragment>)}
  </PixelRoundRect>;
}

/** 묶음 안의 한 줄. 누를 수 있으면 오른쪽에 › 가 붙는다. */
export function IosRow({ title, subtitle, lead, trailing, onPress, accessibilityLabel, subtitleColor }: {
  title: string; subtitle?: string | null; lead?: ReactNode; trailing?: ReactNode; onPress?: () => void;
  accessibilityLabel?: string; subtitleColor?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const body = <>
    {lead ? <View style={styles.lead}>{lead}</View> : null}
    <View style={styles.rowText}>
      <IosText variant="body">{title}</IosText>
      {subtitle ? <IosText variant="caption" style={[styles.subtitle, subtitleColor ? { color: subtitleColor } : null]}>{subtitle}</IosText> : null}
    </View>
    {trailing ?? (onPress ? <PixelGlyph name="chevron_right" size={16} color={phoneIos.gray3} /> : null)}
  </>;
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return <Pressable onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
    accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} style={[styles.row, pressed ? styles.rowPressed : null]}>{body}</Pressable>;
}

/** 줄 머리의 작은 색 칸(iOS 설정 아이콘 자리). */
export function IosLead({ color, glyph }: { color: string; glyph: AnyGlyphName }) {
  return <PixelRoundRect corner="small" fill={color} style={styles.leadTile}>
    <PixelGlyph name={glyph} size={14} color={phoneIos.onBlue} />
  </PixelRoundRect>;
}

const styles = StyleSheet.create({
  cardHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, minWidth: 0, color: phoneIos.label, fontFamily: "Galmuri11Bold", lineHeight: 18 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  text: { color: phoneIos.label },
  button: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  buttonFace: { flexDirection: "row", gap: 4, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
  buttonText: { color: phoneIos.blue, fontFamily: "Galmuri11Bold" },
  buttonTextPrimary: { color: phoneIos.onBlue, fontFamily: "Galmuri11Bold" },
  buttonTextDisabled: { color: phoneIos.label2, fontFamily: "Galmuri11Bold" },
  largeTitle: { color: phoneIos.label, fontFamily: "Galmuri11Bold", fontSize: 22, lineHeight: 28, paddingBottom: 2 },
  sectionHeader: { color: phoneIos.label2, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 2 },
  group: { paddingVertical: 2 },
  separator: { height: 2, backgroundColor: phoneIos.fill, marginLeft: 14 },
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  rowPressed: { backgroundColor: phoneIos.fill },
  rowText: { flex: 1, flexShrink: 1, gap: 2 },
  subtitle: { color: phoneIos.label2 },
  lead: { alignItems: "center", justifyContent: "center" },
  leadTile: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
});
