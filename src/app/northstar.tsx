// 북극성 문장 (rev2 Screen-Spec 21): the propose->ratify editor for the one-line
// 북극성 identity (layer C output). The violet "NORTH STAR" hero card IS the
// editor — the current sentence loads from the newest NORTHSTAR_TAG record and
// 이 문장으로 저장 appends a new tagged record (history preserved, ratify register).
// 세컨비 제안 come from the user's own records (proposeNorthstarSentences); with a
// thin record base the screen says so honestly instead of inventing a persona.
// 다른 제안 받기 re-asks; tapping a suggestion fills the editor (user always confirms).
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import Svg, { Defs, RadialGradient, Rect, Stop, SvgXml } from "react-native-svg";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import {
  MIN_RECORDS_FOR_PROPOSAL,
  fetchCurrentNorthstar,
  proposeNorthstarSentences,
  saveNorthstar,
} from "@/lib/persona/northstar";

// Minimal Material-Symbols-style glyphs the editor needs, rendered as inline SVG
// (same technique as AxisCheck's LensIcon). Stroke-only, colored via `color`.
const ICON: Record<string, string> = {
  check_circle: '<circle cx="12" cy="12" r="8.4"/><path d="m8.4 12 2.5 2.6 4.7-5.2"/>',
  auto_awesome:
    '<path d="M11 3c.4 3.2 2.3 5.1 5.5 5.5-3.2.4-5.1 2.3-5.5 5.5-.4-3.2-2.3-5.1-5.5-5.5C8.7 8.1 10.6 6.2 11 3Z"/><path d="M18 13c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v3.6h3.6"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
};

function Glyph({ name, color, size = 20 }: { name: keyof typeof ICON; color: string; size?: number }) {
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${ICON[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

export default function NorthstarSentence() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const isKo = locale === "ko";
  const { userId, loading, isMinor } = useAuth();

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [proposing, setProposing] = useState(false);
  const [thinBase, setThinBase] = useState(false);

  useEffect(() => {
    if (loading || !userId) return;
    let alive = true;
    fetchCurrentNorthstar(userId)
      .then((s) => {
        if (!alive) return;
        if (s.sentence) setDraft(s.sentence);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loading, userId]);

  const propose = useCallback(async () => {
    if (!userId || proposing) return;
    setProposing(true);
    setThinBase(false);
    try {
      const out = await proposeNorthstarSentences({ userId, locale, minor: isMinor === true });
      if (out) setSuggestions(out);
      else {
        setSuggestions(null);
        setThinBase(true);
      }
    } catch {
      setSuggestions(null);
      setThinBase(true);
    } finally {
      setProposing(false);
    }
  }, [userId, locale, isMinor, proposing]);

  const save = useCallback(async () => {
    if (!userId || saving || draft.trim().length === 0) return;
    setSaving(true);
    try {
      await saveNorthstar({ userId, locale, sentence: draft, minor: isMinor === true });
      router.back();
    } catch {
      setSaving(false);
    }
  }, [userId, locale, draft, isMinor, saving]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={isKo ? "북극성 문장" : "North-star sentence"}
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.headline}>{isKo ? "북극성 문장" : "North-star sentence"}</Text>
      <Text style={styles.sub}>
        {isKo
          ? "일곱 별을 종합해 세컨비가 제안한 문장이에요. 당신의 언어로 다듬어보세요."
          : "SecondB drafted this from your seven stars. Reshape it in your own words."}
      </Text>

      {/* Violet NORTH STAR hero card = the inline editor */}
      <View style={styles.hero}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="nsHero" cx="50%" cy="0%" r="120%">
              <Stop offset="0" stopColor={m3.color.tertiary} stopOpacity={0.22} />
              <Stop offset="1" stopColor={m3.color.surfaceContainerLowest} stopOpacity={0.6} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#nsHero)" />
        </Svg>
        <View style={styles.heroLabelRow}>
          <View style={styles.heroDot} />
          <Text style={styles.heroLabel}>NORTH STAR</Text>
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={isKo ? "나를 깊이 이해해 더 나답게 산다." : "Understand myself deeply, live more like myself."}
          placeholderTextColor={withAlpha(m3.color.onSurface, 0.4)}
          style={styles.heroInput}
        />
      </View>

      <Text style={styles.suggestLabel}>{isKo ? "세컨비 제안" : "SecondB drafts"}</Text>
      <View style={styles.suggestList}>
        {suggestions?.map((s) => {
          const on = s === draft;
          return (
            <MdCard
              key={s}
              variant={on ? "outlined" : "filled"}
              onPress={() => setDraft(s)}
              accessibilityLabel={s}
              style={[styles.suggestCard, on && styles.suggestCardOn]}
            >
              <View style={styles.suggestRow}>
                <Glyph name={on ? "check_circle" : "auto_awesome"} color={on ? m3.color.primary : m3.color.tertiary} size={20} />
                <Text style={styles.suggestText}>{s}</Text>
              </View>
            </MdCard>
          );
        })}
        {thinBase ? (
          <MdCard variant="outlined" style={styles.suggestCard}>
            <Text style={styles.emptyText}>
              {isKo
                ? `아직 기록이 얕아서 제안하기 조심스러워요. 별가루 ${MIN_RECORDS_FOR_PROPOSAL}개쯤 담기면 기록에서 문장을 길어올게요.`
                : `Your record base is still thin. Capture about ${MIN_RECORDS_FOR_PROPOSAL} pieces and I'll draw drafts from them.`}
            </Text>
          </MdCard>
        ) : null}
        <MdButton
          variant="text"
          label={proposing ? (isKo ? "생각 중" : "Thinking") : isKo ? "다른 제안 받기" : "Get other drafts"}
          icon={<Glyph name="replay" color={m3.color.primary} size={18} />}
          onPress={() => void propose()}
          disabled={proposing}
          style={styles.replayBtn}
        />
      </View>

      <View style={styles.actions}>
        <MdButton
          variant="outlined"
          label={isKo ? "취소" : "Cancel"}
          onPress={() => router.back()}
          style={styles.cancelBtn}
        />
        <MdButton
          variant="filled"
          label={isKo ? "이 문장으로 저장" : "Save this sentence"}
          icon={<Glyph name="check" color={m3.color.onPrimary} size={18} />}
          loading={saving}
          onPress={() => void save()}
          disabled={draft.trim().length === 0 || saving}
          style={styles.saveBtn}
        />
      </View>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: spacing.md },
  headline: { ...m3TextStyle("headlineSmall"), color: m3.color.onSurface, marginTop: spacing.xs },
  sub: { ...m3TextStyle("bodyMedium"), color: m3.color.onSurfaceVariant },
  hero: {
    position: "relative",
    borderRadius: 16,
    padding: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: withAlpha(m3.color.tertiary, 0.3),
  },
  heroLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  heroDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: m3.color.tertiary,
    shadowColor: m3.color.tertiary,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  heroLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.2, color: m3.color.tertiary },
  heroInput: {
    fontFamily: m3.font.plain,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
    color: m3.color.onSurface,
    padding: 0,
  },
  suggestLabel: {
    fontFamily: m3.font.mono,
    fontSize: 11,
    letterSpacing: 1.1,
    color: withAlpha(m3.color.onSurfaceVariant, 0.9),
    marginTop: spacing.xs,
  },
  suggestList: { gap: spacing.sm },
  suggestCard: { padding: 14 },
  suggestCardOn: { borderWidth: 1.5, borderColor: m3.color.primary },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  suggestText: { ...m3TextStyle("bodyMedium"), flex: 1, color: m3.color.onSurface },
  emptyText: { ...m3TextStyle("bodyMedium"), color: m3.color.onSurfaceVariant },
  replayBtn: { alignSelf: "flex-start" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  cancelBtn: { flex: 1 },
  saveBtn: { flex: 2 },
});
