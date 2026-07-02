// 북극성 문장 (rev2 Screen-Spec 21): edit + confirm the one-line "who I am".
// Current sentence loads from the newest NORTHSTAR_TAG record; 저장 appends a
// new tagged record (history preserved, ratify register). 세컨비 제안 3안 come
// from the user's own records (proposeNorthstarSentences) — with a thin record
// base the screen says so honestly instead of inventing a persona. 재생성
// re-asks; tapping a suggestion fills the editor (the user always confirms).
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import {
  MIN_RECORDS_FOR_PROPOSAL,
  fetchCurrentNorthstar,
  proposeNorthstarSentences,
  saveNorthstar,
} from "@/lib/persona/northstar";

export default function NorthstarSentence() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const isKo = locale === "ko";
  const { userId, loading, isMinor } = useAuth();

  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [proposing, setProposing] = useState(false);
  const [thinBase, setThinBase] = useState(false);

  useEffect(() => {
    if (loading || !userId) return;
    let alive = true;
    fetchCurrentNorthstar(userId)
      .then((s) => {
        if (!alive) return;
        setCurrent(s.sentence);
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
      setCurrent(draft.trim());
      setSaved(true);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }, [userId, locale, draft, isMinor, saving]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <DeepSpaceScreen active="lens">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text variant="heading">{isKo ? "북극성 문장" : "North-star sentence"}</Text>
        <Text style={styles.sub}>
          {isKo ? "나를 한 줄로. 저장한 문장만 별자리의 북극성에 걸려요." : "You, in one line. Only what you save hangs on your Polaris."}
        </Text>

        {current ? (
          <MdCard variant="filled" style={styles.currentCard}>
            <Text style={styles.currentLabel}>{isKo ? "지금 문장" : "Current"}</Text>
            <Text style={styles.currentText}>{`“${current}”`}</Text>
          </MdCard>
        ) : (
          <MdCard variant="outlined" style={styles.currentCard}>
            <Text style={styles.emptyText}>
              {isKo ? "아직 확정한 문장이 없어요. 직접 쓰거나, 세컨비 제안에서 골라보세요." : "No confirmed sentence yet. Write one, or pick from SecondB's drafts."}
            </Text>
          </MdCard>
        )}

        <Field
          label={isKo ? "문장 편집" : "Edit"}
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            if (saved) setSaved(false);
          }}
          placeholder={isKo ? "나를 깊이 이해해 더 나답게 산다" : "Understand myself deeply, live more like myself"}
          multiline
        />

        <MdButton
          variant="filled"
          label={saving ? (isKo ? "저장 중" : "Saving") : saved ? (isKo ? "저장 완료" : "Saved") : isKo ? "이 문장으로 확정" : "Confirm this sentence"}
          onPress={() => void save()}
          disabled={draft.trim().length === 0 || saving}
        />

        <View style={styles.suggestHead}>
          <Text style={styles.suggestLabel}>{isKo ? "세컨비 제안" : "SecondB drafts"}</Text>
          <MdButton
            variant="text"
            label={proposing ? (isKo ? "생각 중" : "Thinking") : suggestions ? (isKo ? "재생성" : "Regenerate") : isKo ? "제안 받기" : "Suggest"}
            onPress={() => void propose()}
            disabled={proposing}
          />
        </View>

        {suggestions?.map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              setDraft(s);
              setSaved(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={s}
            style={styles.suggestion}
          >
            <Text style={styles.suggestionText}>{s}</Text>
            <Text style={styles.suggestionUse}>{isKo ? "쓰기" : "Use"}</Text>
          </Pressable>
        ))}

        {thinBase ? (
          <MdCard variant="outlined" style={styles.currentCard}>
            <Text style={styles.emptyText}>
              {isKo
                ? `아직 기록이 얕아서 제안하기 조심스러워요. 조각 ${MIN_RECORDS_FOR_PROPOSAL}개쯤 담기면 기록에서 문장을 길어올게요.`
                : `Your record base is still thin. Capture about ${MIN_RECORDS_FOR_PROPOSAL} pieces and I'll draw drafts from them.`}
            </Text>
          </MdCard>
        ) : null}

        <Text style={styles.footer}>
          {isKo ? "확정한 문장은 기록으로 남아요. 언제든 다시 고칠 수 있어요." : "Confirmed sentences are kept as records. You can revise anytime."}
        </Text>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  sub: { fontSize: 13, color: withAlpha(deepSpace.accentSoft, 0.85) },
  currentCard: { gap: 4 },
  currentLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.1, color: withAlpha(deepSpace.accentSoft, 0.7) },
  currentText: { fontSize: 16, lineHeight: 24, color: "#EAF2FF", fontWeight: "600" },
  emptyText: { fontSize: 13.5, lineHeight: 20, color: withAlpha(deepSpace.accentSoft, 0.9) },
  suggestHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  suggestLabel: { fontFamily: m3.font.mono, fontSize: 11, letterSpacing: 1.1, color: withAlpha(deepSpace.accentSoft, 0.75) },
  suggestion: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.3),
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: "#0B1120",
  },
  suggestionText: { flex: 1, fontSize: 14, lineHeight: 21, color: "#EAF2FF" },
  suggestionUse: { fontSize: 12.5, fontWeight: "700", color: deepSpace.accent },
  footer: { fontSize: 12, color: withAlpha(deepSpace.accentSoft, 0.6), marginTop: spacing.xs },
});
