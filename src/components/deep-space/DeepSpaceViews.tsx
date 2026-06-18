/**
 * STEP 4 — the deep-space dock views, translated from design/prototype.dc.html:
 *   CaptureView (담기) · ChatView (세컨비) · LensView (나, empty/error/filled) ·
 *   IdenView (IDEN).
 *
 * Demo data is the design's dummy content; real store/query wiring is marked
 * TODO. Copy lives in the `home` i18n namespace (ds.*) — no hardcoded Korean.
 * Cyan/soul gradients use the sanctioned deepSpaceGradients via react-native-svg
 * (DESIGN.md adoption 2026-06-17). Unique SVG gradient ids via useId() so web
 * (document-global svg ids) never clashes across instances.
 */
import { useId, useState } from "react";
import { type DimensionValue, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { deepSpace, deepSpaceGradients, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

// ── shared gradient primitives ───────────────────────────────────────────────

function GradientFill({ colors, radius = 0 }: { colors: readonly string[]; radius?: number }) {
  const id = "ds-grad-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          {colors.map((c, i) => (
            <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

function GradientButton({
  label,
  colors = deepSpaceGradients.cta,
  onPress,
  full,
}: {
  label: string;
  colors?: readonly string[];
  onPress?: () => void;
  full?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.gButton, full && styles.gButtonFull, pressed && styles.pressed]}
    >
      <GradientFill colors={colors} radius={12} />
      <Text style={styles.gButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function TraitBar({ label, value, up }: { label: string; value: number; up?: boolean }) {
  return (
    <View style={styles.traitRow}>
      <View style={styles.traitHead}>
        <Text style={styles.traitLabel}>{label}</Text>
        <Text style={[styles.traitValue, up && styles.traitValueUp]}>
          {value}
          {up ? " ↑" : ""}
        </Text>
      </View>
      <View style={styles.traitTrack}>
        <View style={[styles.traitFill, { width: `${value}%` as DimensionValue }]}>
          <GradientFill colors={up ? deepSpaceGradients.ctaPositive : deepSpaceGradients.progress} radius={4} />
        </View>
      </View>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

// ── 담기 / Capture ───────────────────────────────────────────────────────────

export function CaptureView() {
  const { t } = useTranslation("home");
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.pixelTitle}>{t("ds.capture.title")}</Text>
      {/* TODO: wire to the real capture store (src/lib/capture). */}
      <View style={styles.inputBox}>
        <Text style={styles.placeholder}>{t("ds.capture.placeholder")}</Text>
      </View>
      <View style={styles.chipRow}>
        <Chip label={t("ds.capture.chipText")} />
        <Chip label={t("ds.capture.chipLink")} />
        <Chip label={t("ds.capture.chipVoice")} />
      </View>
      <View style={styles.noteCard}>
        <Text style={styles.noteText}>{t("ds.capture.tip")}</Text>
      </View>
    </ScrollView>
  );
}

// ── 세컨비 / Chat ────────────────────────────────────────────────────────────

export function ChatView() {
  const { t } = useTranslation("home");
  return (
    <ScrollView contentContainerStyle={[styles.body, styles.chatBody]}>
      {/* TODO: wire to the real SecondB chat (src/lib/chat → gemini.ts, C9→C3). */}
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{t("ds.chat.user")}</Text>
      </View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiText}>{t("ds.chat.ai")}</Text>
      </View>
      <View style={styles.evidenceRow}>
        <Chip label={t("ds.chat.evidence")} />
        <Chip label={t("ds.chat.rhythm")} />
      </View>
      <View style={styles.chipRow}>
        <Chip label={t("ds.chat.suggestRest")} />
        <Chip label={t("ds.chat.suggestImagine")} />
      </View>
    </ScrollView>
  );
}

// ── 나 / Lens (지금의 나) ─────────────────────────────────────────────────────

type LensState = "filled" | "empty" | "error";

function StateToggle({ value, onChange }: { value: LensState; onChange: (s: LensState) => void }) {
  const { t } = useTranslation("home");
  const opts: { key: LensState; label: string }[] = [
    { key: "filled", label: t("ds.lens.toggleFilled") },
    { key: "empty", label: t("ds.lens.toggleEmpty") },
    { key: "error", label: t("ds.lens.toggleError") },
  ];
  return (
    <View style={styles.toggleRow}>
      {opts.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
          accessibilityLabel={o.label}
          style={[styles.toggleBtn, value === o.key && styles.toggleBtnOn]}
        >
          <Text style={styles.toggleLabel}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LensView() {
  const { t } = useTranslation("home");
  const [state, setState] = useState<LensState>("filled");
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <StateToggle value={state} onChange={setState} />
      {state === "empty" ? (
        <View style={styles.centerState}>
          <Svg width={34} height={34} viewBox="0 0 24 24">
            <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={deepSpace.accentSoft} />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.emptyTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.emptyBody")}</Text>
          <GradientButton label={t("ds.lens.emptyCta")} />
        </View>
      ) : state === "error" ? (
        <View style={styles.centerState}>
          <Svg width={32} height={32} viewBox="0 0 24 24" opacity={0.7}>
            <Path d="M12 3l9 16H3z" fill="none" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M12 9v5M12 16.5v.5" stroke={deepSpace.accentSoft} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text style={styles.stateTitle}>{t("ds.lens.errorTitle")}</Text>
          <Text style={styles.stateBody}>{t("ds.lens.errorBody")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("ds.lens.errorCta")} style={styles.ghostBtn}>
            <Text style={styles.ghostLabel}>{t("ds.lens.errorCta")}</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {/* TODO: replace dummy Big Five with persona/bfi.ts results. */}
          <View style={styles.filledHead}>
            <Text style={styles.pixelTitle}>{t("ds.lens.filledTitle")}</Text>
            <Text style={styles.level}>{t("ds.lens.level")}</Text>
          </View>
          <View style={styles.traits}>
            <TraitBar label={t("ds.lens.traitOpenness")} value={72} />
            <TraitBar label={t("ds.lens.traitConscientiousness")} value={58} />
            <TraitBar label={t("ds.lens.traitExtraversion")} value={41} up />
            <TraitBar label={t("ds.lens.traitAgreeableness")} value={67} />
            <TraitBar label={t("ds.lens.traitNeuroticism")} value={39} />
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightText}>{t("ds.lens.insight")}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── IDEN ─────────────────────────────────────────────────────────────────────

export function IdenView() {
  const { t } = useTranslation("home");
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* TODO: render from the real IdenDoc (src/lib/iden). */}
      <View style={styles.idCard}>
        <Text style={styles.idName}>simon.iden</Text>
        <View style={styles.idBadges}>
          <View style={styles.idBadge}>
            <Text style={styles.idBadgeText}>v2.1</Text>
          </View>
          <View style={[styles.idBadge, styles.idBadgeSigned]}>
            <Text style={styles.idBadgeSignedText}>{t("ds.iden.signed")}</Text>
          </View>
        </View>
      </View>
      <View style={styles.idenRowNorth}>
        <Text style={styles.idenKey}>NORTH_STAR</Text>
        <Text style={styles.idenNorthValue}>{t("ds.iden.northStar")}</Text>
      </View>
      <View style={styles.idenRowFive}>
        <Text style={styles.idenKeyCyan}>BIG_FIVE</Text>
        <Text style={styles.idenFiveValue}>O72 C58 E41 A67 N39</Text>
      </View>
      <GradientButton label={t("ds.iden.send")} colors={deepSpaceGradients.idenSend} full />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 28, gap: 0 },
  chatBody: { gap: 10 },
  pixelTitle: { color: deepSpace.accentBright, fontSize: 15, fontFamily: fontFamilies.pixelKo },

  // shared gradient button
  gButton: {
    overflow: "hidden",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 18,
  },
  gButtonFull: { alignSelf: "stretch" },
  gButtonLabel: { color: deepSpace.bgEdge, fontSize: 13, fontFamily: fontFamilies.pixelKo, fontWeight: "700" },
  pressed: { opacity: 0.85 },

  // chips
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  chipLabel: { color: deepSpace.accentSoft, fontSize: 11, fontFamily: fontFamilies.readable },

  // capture
  inputBox: {
    marginTop: 14,
    minHeight: 120,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  placeholder: { color: withAlpha(deepSpace.textHi, 0.5), fontSize: 13, lineHeight: 21, fontFamily: fontFamilies.readable },
  noteCard: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.3),
  },
  noteText: { color: withAlpha(deepSpace.soul, 0.85), fontSize: 11.5, lineHeight: 18, fontFamily: fontFamilies.readable },

  // chat
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "82%",
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 13,
    backgroundColor: withAlpha(deepSpace.accent, 0.16),
  },
  userText: { color: deepSpace.textHi, fontSize: 12.5, lineHeight: 18, fontFamily: fontFamilies.readable },
  aiBubble: {
    alignSelf: "flex-start",
    maxWidth: "86%",
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 13,
    borderBottomLeftRadius: 13,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.25),
    backgroundColor: withAlpha(deepSpace.soul, 0.1),
  },
  aiText: { color: deepSpace.textHi, fontSize: 12.5, lineHeight: 19, fontFamily: fontFamilies.readable },
  evidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignSelf: "flex-start" },

  // lens — state toggle
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  toggleBtnOn: { backgroundColor: deepSpace.cardPressed, borderColor: deepSpace.accent },
  toggleLabel: { color: deepSpace.accentBright, fontSize: 11, fontFamily: fontFamilies.readable },

  // lens — empty / error
  centerState: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 12 },
  stateMark: { fontSize: 34, color: deepSpace.accentSoft },
  stateMarkDim: { opacity: 0.7 },
  stateTitle: { color: deepSpace.accentBright, fontSize: 14, fontFamily: fontFamilies.pixelKo },
  stateBody: { color: withAlpha(deepSpace.text, 0.6), fontSize: 12, lineHeight: 19, textAlign: "center", fontFamily: fontFamilies.readable },
  ghostBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
  },
  ghostLabel: { color: deepSpace.accentSoft, fontSize: 13, fontFamily: fontFamilies.pixelKo },

  // lens — filled
  filledHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  level: { color: deepSpace.mint, fontSize: 10, fontFamily: fontFamilies.pixelEn },
  traits: { marginTop: 16, gap: 11 },
  traitRow: { gap: 4 },
  traitHead: { flexDirection: "row", justifyContent: "space-between" },
  traitLabel: { color: withAlpha(deepSpace.text, 0.7), fontSize: 11, fontFamily: fontFamilies.readable },
  traitValue: { color: withAlpha(deepSpace.text, 0.7), fontSize: 11, fontFamily: fontFamilies.readable },
  traitValueUp: { color: deepSpace.mint },
  traitTrack: { height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: withAlpha(deepSpace.accent, 0.12) },
  traitFill: { height: "100%", borderRadius: 4, overflow: "hidden" },
  insightCard: {
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.mint, 0.25),
    backgroundColor: withAlpha(deepSpace.mint, 0.05),
  },
  insightText: { color: deepSpace.accentBright, fontSize: 11.5, lineHeight: 18, fontFamily: fontFamilies.readable },

  // iden
  idCard: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.soul, 0.3),
    backgroundColor: withAlpha(deepSpace.soul, 0.07),
    gap: 7,
  },
  idName: { color: deepSpace.accentBright, fontSize: 12, fontFamily: fontFamilies.mono },
  idBadges: { flexDirection: "row", gap: 5 },
  idBadge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5, backgroundColor: withAlpha(deepSpace.soul, 0.14) },
  idBadgeText: { color: withAlpha(deepSpace.soul, 0.8), fontSize: 9, fontFamily: fontFamilies.mono },
  idBadgeSigned: { backgroundColor: withAlpha(deepSpace.mint, 0.1) },
  idBadgeSignedText: { color: deepSpace.mint, fontSize: 9, fontFamily: fontFamilies.readable },
  idenRowNorth: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
    borderLeftColor: deepSpace.soul,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: withAlpha(deepSpace.soul, 0.06),
  },
  idenKey: { color: withAlpha(deepSpace.soul, 0.65), fontSize: 6, fontFamily: fontFamilies.pixelEn },
  idenKeyCyan: { color: withAlpha(deepSpace.accentSoft, 0.6), fontSize: 6, fontFamily: fontFamilies.pixelEn },
  idenNorthValue: { color: deepSpace.accentBright, fontSize: 11.5, lineHeight: 18, marginTop: 5, fontFamily: fontFamilies.readable },
  idenRowFive: {
    marginTop: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
    borderLeftColor: deepSpace.accent,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: deepSpace.card,
  },
  idenFiveValue: { color: deepSpace.accentSoft, fontSize: 10, marginTop: 6, fontFamily: fontFamilies.mono },
});
