// 통화 직후 회고 (call recording v1, docs/CALL-RECORDING-SPEC.md §5).
// The legally-light shape: no call audio is touched. A short structured
// reflection right after a call — who (nickname only), the gist, how it felt,
// one follow-up — saved as a note with the 0066 structured payload so the
// system and 세컨비 read the fields, not prose. The native end-of-call trigger
// (call-log permission) joins in the next native cycle; until then this screen
// is reachable directly and from wherever the user builds the habit.
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { createRecord } from "@/lib/records/create";
import { composeStructured } from "@/lib/capture/structured";
import { spacing } from "@/lib/theme/tokens";

export default function CallReflection() {
  const { t, i18n } = useTranslation("capture");
  const locale = i18n.language === "ko" ? "ko" : "en";
  const { userId, isMinor, loading } = useAuth();
  const progression = useProgression();

  const [who, setWho] = useState("");
  const [gist, setGist] = useState("");
  const [feeling, setFeeling] = useState("");
  const [followup, setFollowup] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const canSave = gist.trim().length > 0 && !busy;

  async function save() {
    if (!userId || !canSave) return;
    setBusy(true);
    try {
      const fields = { who_label: who, gist, feeling, followup };
      const bodyLines = [
        who.trim() ? `${t("callReflection.who")}: ${who.trim()}` : null,
        gist.trim(),
        feeling.trim() ? `${t("callReflection.feeling")}: ${feeling.trim()}` : null,
        followup.trim() ? `${t("callReflection.followup")}: ${followup.trim()}` : null,
      ].filter(Boolean) as string[];
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: bodyLines.join("\n"),
        topic: who.trim() ? `${t("callReflection.topicPrefix")} · ${who.trim()}` : t("callReflection.topicPrefix"),
        tags: ["call_reflection"],
        tier: progression.tier,
        minor: isMinor === true,
        structured: composeStructured("call_reflection", fields) ?? undefined,
      });
      setSaved(true);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[call-reflection] save failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DeepSpaceScreen active="capture">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text variant="heading">{t("callReflection.title")}</Text>
        <Text variant="caption" color="textSubtle">{t("callReflection.intro")}</Text>

        {saved ? (
          <MdCard variant="outlined" style={styles.card}>
            <Text variant="body">{t("callReflection.savedNote")}</Text>
            <MdButton variant="tonal" label={t("callReflection.openRecords")} onPress={() => router.push("/records")} />
          </MdCard>
        ) : (
          <MdCard variant="outlined" style={styles.card}>
            <Field
              label={t("callReflection.who")}
              value={who}
              onChangeText={setWho}
              placeholder={locale === "ko" ? "예) 어머니, 팀장님" : "e.g. Mom, my manager"}
            />
            <Field
              label={t("callReflection.gist")}
              value={gist}
              onChangeText={setGist}
              multiline
              numberOfLines={3}
              placeholder={locale === "ko" ? "무슨 이야기였나요?" : "What was it about?"}
            />
            <Field
              label={t("callReflection.feeling")}
              value={feeling}
              onChangeText={setFeeling}
              placeholder={locale === "ko" ? "통화하고 나서 남은 느낌" : "What stayed with you after"}
            />
            <Field
              label={t("callReflection.followup")}
              value={followup}
              onChangeText={setFollowup}
              placeholder={locale === "ko" ? "해야 할 한 가지가 있다면" : "One thing to do, if any"}
            />
            <MdButton
              variant="filled"
              label={busy ? t("callReflection.saving") : t("callReflection.saveCta")}
              onPress={() => void save()}
              disabled={!canSave}
            />
            <Text variant="caption" color="textSubtle">{t("callReflection.privacyLine")}</Text>
          </MdCard>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  card: { padding: spacing.md, gap: spacing.sm },
});
